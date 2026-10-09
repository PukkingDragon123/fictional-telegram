"""Cloth physics for the hanging and draped fabrics.

A grid of particles (Verlet integration) joined by stretch / shear / bend
constraints, pinned where the cloth hangs, pushed by gravity and a looping
breeze, colliding with boxes (the mattress) and the wall. After a warm-up
the motion settles into a loop; one period is captured as F frames and the
tiny residual drift is distributed over the loop so frame F == frame 0.

Rendering projects the 3D mesh to the screen, lights every pixel from its
interpolated normal (so folds and billows read), and snaps the colour to a
palette ramp chosen by a texture function - stripes, patchwork, prints."""
import math
import numpy as np
from pixel import Canvas, PAL, RAMPS

LIGHT = np.array([-0.45, -0.6, 0.66])
LIGHT /= np.linalg.norm(LIGHT)


class Cloth:
    def __init__(self, nx, ny, spacing, origin=(0, 0, 0), axis='vertical'):
        self.nx, self.ny, self.sp = nx, ny, spacing
        ox, oy, oz = origin
        P = np.zeros((ny, nx, 3))
        for j in range(ny):
            for i in range(nx):
                if axis == 'vertical':          # hanging sheet in the x-y plane
                    P[j, i] = (ox + i * spacing, oy + j * spacing, oz)
                else:                           # lying sheet in the x-z plane
                    P[j, i] = (ox + i * spacing, oy, oz + j * spacing)
        self.P = P.reshape(-1, 3)
        self.prev = self.P.copy()
        self.pins = {}
        self.colliders = []
        self.wall_z = None
        self.floor_y = None
        cons = []
        idx = lambda i, j: j * nx + i
        for j in range(ny):
            for i in range(nx):
                for (di, dj, kind) in ((1, 0, 's'), (0, 1, 's'), (1, 1, 'd'), (-1, 1, 'd'), (2, 0, 'b'), (0, 2, 'b')):
                    i2, j2 = i + di, j + dj
                    if 0 <= i2 < nx and 0 <= j2 < ny:
                        cons.append((idx(i, j), idx(i2, j2), kind))
        self.A = np.array([c[0] for c in cons])
        self.B = np.array([c[1] for c in cons])
        self.rest = np.linalg.norm(self.P[self.B] - self.P[self.A], axis=1)
        self.kind = np.array([c[2] for c in cons])
        self.stiff = np.where(self.kind == 's', 1.0, np.where(self.kind == 'd', 0.8, 0.25))

    def pin(self, i, j, pos=None):
        k = j * self.nx + i
        self.pins[k] = np.array(pos if pos is not None else self.P[k], float)

    def pin_row(self, j=0, every=1, gather=1.0, pleat=1.5, x0=None):
        """Pin a row. gather < 1 bunches the pins closer than the cloth's
        rest width, so it hangs in real folds; pleat seeds the fold depth."""
        G = self.P.reshape(self.ny, self.nx, 3)
        base_x = G[j, 0, 0] if x0 is None else x0
        for jj in range(self.ny):          # seed alternating pleats so folds go in/out (z)
            for i in range(self.nx):
                G[jj, i, 2] += pleat * (1 if i % 2 else -1) * (0.4 + 0.6 * (1 - jj / self.ny))
                G[jj, i, 0] = base_x + (G[jj, i, 0] - base_x) * (gather + (1 - gather) * jj / self.ny)
        self.P = G.reshape(-1, 3)
        self.prev = self.P.copy()
        for i in range(0, self.nx, every):
            self.pin(i, j)
        self.pin(self.nx - 1, j)

    def add_box(self, x0, y0, z0, x1, y1, z1, friction=0.6):
        self.colliders.append(('box', np.array([x0, y0, z0]), np.array([x1, y1, z1]), friction))

    def add_ellipsoid(self, c, r, friction=0.5):
        self.colliders.append(('ell', np.array(c, float), np.array(r, float), friction))

    def _satisfy(self, iters=12):
        P = self.P
        for _ in range(iters):
            d = P[self.B] - P[self.A]
            L = np.linalg.norm(d, axis=1) + 1e-9
            diff = np.clip((L - self.rest) / L, -0.3, 0.3) * 0.5 * self.stiff
            corr = d * diff[:, None]
            delta = np.zeros_like(P)
            np.add.at(delta, self.A, corr)
            np.add.at(delta, self.B, -corr)
            P += delta * 0.5
            for k, p in self.pins.items():
                P[k] = p
            self._collide()

    def _collide(self):
        P = self.P
        for c in self.colliders:
            if c[0] == 'box':
                lo, hi, fr = c[1], c[2], c[3]
                inside = np.all((P > lo) & (P < hi), axis=1)
                if not inside.any():
                    continue
                q = P[inside]
                pen = np.stack([q[:, 0] - lo[0], hi[0] - q[:, 0], q[:, 1] - lo[1], hi[1] - q[:, 1],
                                q[:, 2] - lo[2], hi[2] - q[:, 2]], axis=1)
                face = np.argmin(pen, axis=1)
                for f in range(6):
                    m = face == f
                    if not m.any():
                        continue
                    ax, side = f // 2, f % 2
                    q[m, ax] = lo[ax] if side == 0 else hi[ax]
                P[inside] = q
                # friction: kill sliding for resting particles
                pr = self.prev[inside]
                self.prev[inside] = q - (q - pr) * (1 - fr)
            else:
                cen, rad, fr = c[1], c[2], c[3]
                d = (P - cen) / rad
                r = np.linalg.norm(d, axis=1)
                m = r < 1
                if m.any():
                    P[m] = cen + d[m] / r[m, None] * rad
                    self.prev[m] = P[m] - (P[m] - self.prev[m]) * (1 - fr)
        if self.wall_z is not None:
            m = P[:, 2] < self.wall_z
            P[m, 2] = self.wall_z
        if self.floor_y is not None:
            m = P[:, 1] > self.floor_y
            P[m, 1] = self.floor_y
            self.prev[m] = P[m] - (P[m] - self.prev[m]) * 0.2

    def step(self, dt, wind, damping=0.985, gravity=60.0):
        P, prev = self.P, self.prev
        acc = np.zeros_like(P)
        acc[:, 1] += gravity
        acc += wind(P)
        new = P + (P - prev) * damping + acc * dt * dt
        self.prev = P.copy()
        self.P = new
        for k, p in self.pins.items():
            self.P[k] = p
        self._satisfy()

    def normals(self):
        G = self.P.reshape(self.ny, self.nx, 3)
        dx = np.zeros_like(G)
        dy = np.zeros_like(G)
        dx[:, 1:-1] = G[:, 2:] - G[:, :-2]
        dx[:, 0] = G[:, 1] - G[:, 0]
        dx[:, -1] = G[:, -1] - G[:, -2]
        dy[1:-1] = G[2:] - G[:-2]
        dy[0] = G[1] - G[0]
        dy[-1] = G[-1] - G[-2]
        n = np.cross(dx, dy)
        n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-9
        return n


def breeze(base=(0, 0, 0), amp=(14, 2, 10), period=1.0, waves=0.06, gust=0.5, seed=0):
    """Looping wind field: travelling sine waves + a periodic gust; period in
    seconds of simulation time. Returns wind(P) closure using cloth time."""
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 6.28, 3)
    state = {'t': 0.0}

    def wind(P):
        t = state['t']
        w = 2 * math.pi * t / period
        s = np.sin(w + P[:, 0] * waves + ph[0]) + gust * np.sin(2 * w + P[:, 1] * waves * 0.7 + ph[1])
        out = np.zeros_like(P)
        out[:, 0] = base[0] + amp[0] * s
        out[:, 1] = base[1] + amp[1] * np.sin(w + ph[2])
        out[:, 2] = base[2] + amp[2] * (0.6 + 0.4 * np.sin(w + P[:, 0] * waves * 1.3 + ph[2]))
        return out
    wind.state = state
    return wind


def simulate(cloth, wind, frames=12, substeps=10, warm_periods=4, period=1.0, settle=0, **kw):
    """Run the cloth and capture one wind period as `frames` snapshots,
    corrected so the loop closes exactly."""
    dt = period / (frames * substeps)
    t = 0.0
    for _ in range(settle):                       # let it fall / drape first
        wind.state['t'] = 0.0
        cloth.step(dt, lambda P: np.zeros_like(P), **kw)
    for _ in range(warm_periods * frames * substeps):
        wind.state['t'] = t
        cloth.step(dt, wind, **kw)
        t += dt
    snaps = []
    for f in range(frames + 1):
        snaps.append(cloth.P.copy())
        for _ in range(substeps):
            wind.state['t'] = t
            cloth.step(dt, wind, **kw)
            t += dt
    drift = snaps[-1] - snaps[0]
    out = [snaps[f] - drift * (f / frames) for f in range(frames)]
    return out


def render(cloth, P, tex, w, h, ox=0, oy=0, tilt=0.0, amb=0.3, outline=True, two_sided=True,
           fold=2.2, mid=0.62, spread=0.55):
    """Rasterise the cloth (positions P) into a w x h Canvas.
    tex(u, v, back) -> ramp list (dark->light) or None for a hole.
    (ox, oy): screen position of world origin."""
    nx, ny = cloth.nx, cloth.ny
    cloth.P = P
    N = cloth.normals().reshape(-1, 3)
    G = P.reshape(ny, nx, 3)
    sx = G[:, :, 0] + ox
    sy = G[:, :, 1] + G[:, :, 2] * tilt + oy
    zb = np.full((h, w), -1e9)
    col = [[None] * w for _ in range(h)]
    Nn = N.reshape(ny, nx, 3).copy()
    Nn[:, :, :2] *= fold                 # exaggerate folds so they read in pixels
    Nn /= np.linalg.norm(Nn, axis=2, keepdims=True) + 1e-9
    VIEW = np.array([0.0, -tilt, 1.0])
    VIEW /= np.linalg.norm(VIEW)

    def tri(a, b, c):
        (xa, ya, za, ua, va, na), (xb, yb, zb_, ub, vb, nb), (xc, yc, zc, uc, vc, nc) = a, b, c
        x0, x1 = int(math.floor(min(xa, xb, xc))), int(math.ceil(max(xa, xb, xc)))
        y0, y1 = int(math.floor(min(ya, yb, yc))), int(math.ceil(max(ya, yb, yc)))
        den = (yb - yc) * (xa - xc) + (xc - xb) * (ya - yc)
        if abs(den) < 1e-9:
            return
        for y in range(max(0, y0), min(h, y1 + 1)):
            for x in range(max(0, x0), min(w, x1 + 1)):
                px_, py_ = x + 0.5, y + 0.5
                l1 = ((yb - yc) * (px_ - xc) + (xc - xb) * (py_ - yc)) / den
                l2 = ((yc - ya) * (px_ - xc) + (xa - xc) * (py_ - yc)) / den
                l3 = 1 - l1 - l2
                if l1 < -0.02 or l2 < -0.02 or l3 < -0.02:
                    continue
                z = l1 * za + l2 * zb_ + l3 * zc
                if z <= zb[y, x]:
                    continue
                u = l1 * ua + l2 * ub + l3 * uc
                v = l1 * va + l2 * vb + l3 * vc
                n = l1 * na + l2 * nb + l3 * nc
                n = n / (np.linalg.norm(n) + 1e-9)
                back = float(n @ VIEW) < 0
                if back and two_sided:
                    n = -n
                lit = float(n @ LIGHT)
                if back:
                    lit -= 0.25
                ramp = tex(u, v, back)
                if ramp is None:
                    continue
                k = len(ramp)
                i = int(max(0, min(k - 1, ((lit - mid) / spread + 0.5) * k)))
                zb[y, x] = z
                col[y][x] = ramp[i]

    for j in range(ny - 1):
        for i in range(nx - 1):
            def V(ii, jj):
                return (sx[jj, ii], sy[jj, ii], G[jj, ii, 2], ii / (nx - 1), jj / (ny - 1), Nn[jj, ii])
            a, b, c, d = V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)
            tri(a, b, c)
            tri(a, c, d)
    cv = Canvas(w, h)
    for y in range(h):
        for x in range(w):
            if col[y][x] is not None:
                cv.px(x, y, col[y][x])
    if outline:
        cv.outline(selective=True)
    return cv
