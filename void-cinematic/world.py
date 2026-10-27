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
VOID = np.array([24, 8, 14], np.float32)
LEAF = [np.array(c, np.float32) for c in ((70, 150, 84), (58, 132, 74), (84, 168, 100), (48, 112, 66))]
DEAD = np.array([30, 26, 30], np.float32)
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
        cand = rng.uniform([-1300, 280], [1300, 1700], (4200, 2))
        dens = fbm(64, 64, seed + 3, 3)
        for (x, z) in cand:
            h = float(height(x, z))
            if not 5 < h < 360:
                continue
            fx, fz = int((x + 1300) / 2600 * 63), int((z - 280) / 1420 * 63)
            band = 1.0 if 330 < z < 1400 else 0.35
            if rng.rand() > band * (0.35 + dens[fz, fx]):
                continue
            g = (float(height(x + 6, z)) - float(height(x - 6, z))) / 12, (float(height(x, z + 6)) - float(height(x, z - 6))) / 12
            if math.hypot(*g) > 0.9:
                continue
            self.trees.append(self._tree(rng, x, h - 1, z))
            if len(self.trees) >= 620:
                break
        self.rot = np.zeros(len(self.trees))                         # how far each tree has rotted
        self.steps = []                                              # footsteps: (x, z, time, on water)

    def _tree(self, rng, x, y, z):
        s = rng.uniform(13, 24)
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
        return dict(x=x, y=y, z=z, s=s, trunk=(tv, tf), parts=parts, leaves=[])

    # ---------------------------------------------------------------- per frame
    def sea_mesh(self, t, rot=None):
        y = 0.9 * np.sin(self.sx * 0.021 + t * 1.3) + 0.6 * np.sin(self.sz * 0.017 - t * 1.1 + self.sx * 0.006) + \
            0.25 * np.sin(self.sx * 0.09 + self.sz * 0.07 + t * 2.4)
        v = np.stack([self.sx, y, self.sz], -1).astype(np.float32)
        col = self.scol_v[self.sf].mean(1)
        if rot is not None:
            r = rot[self.sf].mean(1)[:, None]
            col = col * (1 - r) + VOID * r
        m = Mesh()
        m.add(v, self.sf, col, 5)
        return m, y

    def sea_rot(self, T):
        """How rotten the water is at each sea vertex at story time T: black rings
        spreading from every footstep in the water."""
        r = np.zeros(len(self.sx))
        for (x, z, t0, water) in self.steps:
            if not water or T < t0:
                continue
            rad = 18 + 26 * (T - t0) ** 0.8
            d = np.hypot(self.sx - x, self.sz - z)
            r = np.maximum(r, np.clip(1 - (d - rad * 0.7) / (rad * 0.5), 0, 1))
        return r

    def land_mesh(self, T):
        col = self.tcol0.copy()
        for (x, z, t0, water) in self.steps:                         # dead ground under each footstep
            if water or T < t0:
                continue
            rad = 22 + 10 * min(4.0, T - t0)
            d = np.hypot(self.tcen[:, 0] - x, self.tcen[:, 2] - z)
            k = np.clip(1 - d / rad, 0, 1)[:, None]
            col = col * (1 - k) + DEAD * k
        m = Mesh()
        m.add(self.tv, self.tf, col, 4)
        return m

    def tree_mesh(self, t):
        m = Mesh()
        for i, tr in enumerate(self.trees):
            r = self.rot[i]
            tv, tf = tr['trunk']
            m.add(tv, tf, (40, 60, 80) if r < 0.5 else DEAD, 1000 + i)
            sway = math.sin(t * 1.3 + tr['x'] * 0.01) * 0.6 * (1 - r)
            for (v, f, c) in tr['parts']:
                vv = v.copy()
                if r > 0 or sway:
                    cy = tr['y']
                    k = (vv[:, 1] - cy) / tr['s']
                    vv[:, 0] += sway * k
                    if r > 0:                                        # sags, shrinks, goes black
                        cen = vv.mean(0)
                        vv = cen + (vv - cen) * (1 - 0.3 * r)
                        vv[:, 1] -= r * tr['s'] * 0.18 * k
                cc = c * (1 - r) + DEAD * r
                m.add(vv, f, cc, 1000 + i)
        return m

    def rot_trees(self, path_fn, T, reach=150.0):
        """Rot the trees the giant has passed: each starts when it goes by, the
        rot spreading outward from its path."""
        for i, tr in enumerate(self.trees):
            if 't_pass' not in tr:
                ts = np.linspace(0, 60, 1200)
                pts = np.array([path_fn(u) for u in ts])
                d = np.hypot(pts[:, 0] - tr['x'], pts[:, 2] - tr['z'])
                j = int(np.argmin(d))
                tr['t_pass'], tr['d_pass'] = float(ts[j]), float(d[j])
            dt = T - tr['t_pass'] - tr['d_pass'] / 120.0
            self.rot[i] = float(np.clip(dt / 2.2, 0, 1)) if tr['d_pass'] < reach else 0.0


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
    cloud = np.array([250, 246, 244], np.float32)[None, None] * (0.78 + 0.22 * shade[..., None]) + \
        np.array([30, 10, -10], np.float32) * (1 - shade[..., None])
    return img * (1 - a[..., None]) + cloud * a[..., None], hz


_CLOUDS = {}


def _clouds(W, H, seed):
    """Big soft cumulus, lit from above: alpha and light, a wide strip."""
    key = (W, H, seed)
    if key not in _CLOUDS:
        Wb = W * 4
        Hb = int(H * 0.7)
        n = fbm(Hb, Wb, seed, 6) * 0.65 + fbm(Hb, Wb, seed + 1, 18) * 0.35
        yy = np.linspace(0, 1, Hb)[:, None]
        band = np.exp(-((yy - 0.55) / 0.28) ** 2)
        a = np.clip((n * band - 0.42) * 6, 0, 1)
        lit = np.clip((cv2.GaussianBlur(a, (0, 0), 6) - np.roll(cv2.GaussianBlur(a, (0, 0), 6), 10, 0)) * 3 + 0.6, 0, 1)
        _CLOUDS[key] = np.stack([cv2.GaussianBlur(a, (0, 0), 1.5), lit], -1).astype(np.float32)
    return _CLOUDS[key]
