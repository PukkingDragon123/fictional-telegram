"""The lake's giant, one for each season (summer keeps the whale in lake.py).

    spring   a giant koi - white with red patches, long flowing butterfly
             fins - leaps from the lake in a slow arc, bending as it goes,
             and slips back in among the floating petals
    autumn   a giant fox goes skipping across the water from left to right,
             bound after bound; every time its paws touch down the water
             splashes and rings spread out, and its reflection runs with it
    winter   a giant red-crowned crane comes gliding in from the right, low
             over the lake, with slow deep wingbeats; its wingtips brush the
             water, leaving rings, and it climbs away to the left

Each creature is a small 3D model rendered per frame: its surfaces (tubes
along a spine, ellipsoids, flat sheets for ears, fins and wings) are sampled
densely and splatted into a depth buffer with their normals, then lit from
the upper left and quantised to palette ramps with an ordered dither, with a
dark line around the silhouette and where one part passes in front of
another. Water effects (splashes, rings, foam, reflections) are drawn on top.

frames(season, horizon) -> (list of RGBA arrays (h, w, 4), (x0, y0)): a
cropped layer at (x0, y0) in the outside layer, NG frames at FPS."""
import math
import random
import numpy as np
from pixel import PAL

NG = 120                     # frames in the loop
FPS = 12                     # 10 s
LIGHT = np.array([-0.5, -0.72, 0.5])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47


def _rgb(names):
    return np.array([PAL[c] for c in names], np.uint8)


def _unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


# ---------------------------------------------------------------- the renderer
class Splat:
    """Depth buffer of surface samples: normal, material, surface coords (u, v) and part."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.z = np.full((h, w), -1e9, np.float32)
        self.n = np.zeros((h, w, 3), np.float32)
        self.m = np.zeros((h, w), np.int16)
        self.u = np.zeros((h, w), np.float32)
        self.v = np.zeros((h, w), np.float32)
        self.part = np.zeros((h, w), np.int16)

    def add(self, P, N, mat, u=None, v=None, part=0):
        P = np.asarray(P, np.float32).reshape(-1, 3)
        N = np.asarray(N, np.float32).reshape(-1, 3)
        ix = np.floor(P[:, 0]).astype(int)
        iy = np.floor(P[:, 1]).astype(int)
        ok = (ix >= 0) & (ix < self.w) & (iy >= 0) & (iy < self.h)
        if not ok.any():
            return
        z = P[:, 2]
        n = len(P)
        u = np.zeros(n, np.float32) if u is None else np.broadcast_to(np.asarray(u, np.float32).ravel(), (n,))
        v = np.zeros(n, np.float32) if v is None else np.broadcast_to(np.asarray(v, np.float32).ravel(), (n,))
        mat = np.broadcast_to(np.asarray(mat, np.int16).ravel(), (n,))
        sel = np.nonzero(ok)[0]
        sel = sel[np.argsort(z[sel], kind='stable')]              # far first, so the nearest is written last
        ix, iy, z, N, u, v, mat = ix[sel], iy[sel], z[sel], N[sel], u[sel], v[sel], mat[sel]
        keep = z > self.z[iy, ix]
        ix, iy, z, N, u, v, mat = ix[keep], iy[keep], z[keep], N[keep], u[keep], v[keep], mat[keep]
        self.z[iy, ix] = z
        self.n[iy, ix] = N
        self.m[iy, ix] = mat
        self.u[iy, ix] = u
        self.v[iy, ix] = v
        self.part[iy, ix] = part

    # -- surfaces
    def tube(self, spine, ry, rz=None, mat=1, part=0, step=0.35, open_ends=False):
        """A tube along spine (K, 3) with elliptical sections ry x rz (K,). u along, v around."""
        spine = np.asarray(spine, float)
        ry = np.asarray(ry, float)
        rz = ry if rz is None else np.asarray(rz, float)
        seg = np.linalg.norm(np.diff(spine, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        L = s[-1]
        if L <= 0:
            return
        ns = max(2, int(L / step))
        t = np.linspace(0, L, ns)
        C = np.stack([np.interp(t, s, spine[:, k]) for k in range(3)], 1)
        RY, RZ = np.interp(t, s, ry), np.interp(t, s, rz)
        T = _unit(np.gradient(C, axis=0))
        N1 = _unit(np.stack([-T[:, 1], T[:, 0], np.zeros(ns)], 1) + 1e-6)
        N2 = _unit(np.cross(T, N1))
        N2 *= np.sign(N2[:, 2:3] + 1e-6)                            # keep "around" pointing at the viewer
        na = max(8, int(2 * math.pi * max(RY.max(), RZ.max()) / step))
        ph = np.linspace(0, 2 * math.pi, na, endpoint=False)
        cph, sph = np.cos(ph)[None, :, None], np.sin(ph)[None, :, None]
        P = C[:, None, :] + RY[:, None, None] * cph * N1[:, None, :] + RZ[:, None, None] * sph * N2[:, None, :]
        Nn = _unit(cph * N1[:, None, :] / np.maximum(RY, 0.2)[:, None, None]
                   + sph * N2[:, None, :] / np.maximum(RZ, 0.2)[:, None, None])
        U = np.broadcast_to((t / L)[:, None], (ns, na))
        V = np.broadcast_to((ph / (2 * math.pi))[None, :], (ns, na))
        self.add(P.reshape(-1, 3), Nn.reshape(-1, 3), mat, U, V, part)
        if not open_ends:
            for end, sgn in ((0, -1), (-1, 1)):
                self.ellipsoid(C[end], (max(RY[end], RZ[end]),) * 3, mat, part=part, u=float(end != 0))

    def ellipsoid(self, c, r, mat=1, rot=0.0, part=0, step=0.35, u=None):
        """Ellipsoid at c with radii r (rx, ry, rz), turned by rot in the screen plane."""
        rx, ry, rz = r
        R = max(rx, ry, rz)
        nt = max(6, int(math.pi * R / step))
        nf = max(8, int(2 * math.pi * R / step))
        th = np.linspace(0, math.pi, nt)[:, None]
        fi = np.linspace(0, 2 * math.pi, nf, endpoint=False)[None, :]
        x = np.sin(th) * np.cos(fi)
        y = np.sin(th) * np.sin(fi)
        zz = np.cos(th) * np.ones_like(fi)
        ca, sa = math.cos(rot), math.sin(rot)
        Px = x * rx * ca - y * ry * sa
        Py = x * rx * sa + y * ry * ca
        Nx, Ny = x / rx, y / ry
        Nxr = Nx * ca - Ny * sa
        Nyr = Nx * sa + Ny * ca
        P = np.stack([Px + c[0], Py + c[1], zz * rz + c[2]], -1).reshape(-1, 3)
        Nn = _unit(np.stack([Nxr, Nyr, zz / rz], -1)).reshape(-1, 3)
        U = np.broadcast_to(th / math.pi, x.shape).ravel() if u is None else u
        V = np.broadcast_to(fi / (2 * math.pi), x.shape).ravel()
        self.add(P, Nn, mat, U, V, part)

    def sheet(self, fn, nu, nv, mat=1, part=0, mask=None, normal=None):
        """A surface (u, v) in [0,1]^2 -> 3D points via fn(U, V) (arrays). Both
        faces render; the normal is turned to face the viewer."""
        U, V = np.meshgrid(np.linspace(0, 1, nu), np.linspace(0, 1, nv), indexing='ij')
        P = fn(U, V)
        if normal is None:
            du = np.gradient(P, axis=0)
            dv = np.gradient(P, axis=1)
            Nn = _unit(np.cross(du, dv))
        else:
            Nn = np.broadcast_to(np.asarray(normal, float), P.shape)
        Nn = Nn * np.sign(Nn[..., 2:3] + 1e-6)
        keep = np.ones(U.shape, bool) if mask is None else mask(U, V)
        self.add(P[keep], Nn[keep], mat, U[keep], V[keep], part)

    # -- painting
    def render(self, mats, light=LIGHT, line='ink', inner_line=2.5, rim=0.0):
        """mats: {id: (ramp names dark->light, ambient[, two_sided])}. Returns RGBA (h, w, 4).
        Two-sided materials (thin sheets: wings, fins) are lit on whichever face we see."""
        out = np.zeros((self.h, self.w, 4), np.uint8)
        solid = self.m > 0
        if not solid.any():
            return out
        dot = (self.n * light).sum(-1)
        lam = np.clip(dot, 0, 1)
        two = np.zeros_like(solid)
        for mid, spec in mats.items():
            if len(spec) > 2 and spec[2]:
                two |= self.m == mid
        lam = np.where(two, np.abs(dot) * 0.85, lam)
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        th = BAYER[yy % 4, xx % 4]
        for mid, spec in mats.items():
            ramp, amb = spec[0], spec[1]
            m = solid & (self.m == mid)
            if not m.any():
                continue
            val = amb + (1 - amb) * lam + rim * (1 - np.abs(self.n[..., 2])) ** 2
            rgb = _rgb(ramp)
            k = np.clip(np.floor(val * (len(ramp) - 1) + 0.5 + th * 0.85), 0, len(ramp) - 1).astype(int)
            out[m, :3] = rgb[k[m]]
            out[m, 3] = 255
        # a dark line where one part passes in front of another
        if inner_line:
            z = self.z
            for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                nb = np.roll(np.roll(z, dy, 0), dx, 1)
                nbm = np.roll(np.roll(solid, dy, 0), dx, 1)
                behind = solid & nbm & (nb - z > inner_line)
                for mid, spec in mats.items():
                    mm = behind & (self.m == mid)
                    if mm.any():
                        out[mm, :3] = PAL[spec[0][0]]
        # the silhouette
        edge = solid & ~(np.roll(solid, 1, 0) & np.roll(solid, -1, 0) & np.roll(solid, 1, 1) & np.roll(solid, -1, 1))
        out[edge, :3] = PAL[line]
        return out


def place(dst, src, x, y, alpha=None):
    """Blit RGBA src into dst at (x, y), alpha-over."""
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    d = dst[y0:y1, x0:x1].astype(np.float32)
    a = s[..., 3:4] / 255.0 * (1.0 if alpha is None else alpha)
    d[..., :3] = d[..., :3] * (1 - a) + s[..., :3] * a
    d[..., 3:4] = np.maximum(d[..., 3:4], a * 255)
    dst[y0:y1, x0:x1] = d.astype(np.uint8)


# ---------------------------------------------------------------- water, shared
class Water:
    """Splashes, rings, foam and reflections on the lake at water line wl."""

    def __init__(self, w, h, wl, seed):
        self.w, self.h, self.wl = w, h, wl
        self.rng = random.Random(seed)
        self.drops = []          # (t0, x, y, vx, vy, size)
        self.rings = []          # (t0, x, size, life)
        self.foam = []           # (t0, x, size, life)

    def splash(self, t0, x, n=40, power=1.0, spread=6.0):
        r = self.rng
        for _ in range(n):
            a = r.uniform(0.25, math.pi - 0.25)
            v = r.uniform(0.6, 2.6) * power
            self.drops.append((t0 + r.uniform(0, 1.5), x + r.uniform(-spread, spread), self.wl,
                               math.cos(a) * v * 0.8, math.sin(a) * v, r.choice((1, 1, 1, 2))))
        self.rings.append((t0, x, 4 + 3 * power, 30))
        self.foam.append((t0, x, 5 + 4 * power, 14))

    def ripple(self, t0, x, size=3, life=26):
        self.rings.append((t0, x, size, life))

    def draw(self, a, f, period=NG):
        H, W, wl = self.h, self.w, self.wl
        YY, XX = np.mgrid[0:H, 0:W]
        for (t0, cx, size, life) in self.foam:
            dt = (f - t0) % period
            if dt <= life:
                k = dt / life
                rr = size * (0.6 + 0.7 * k)
                m = (((XX - cx) / rr) ** 2 + ((YY - wl - 1) / (rr * 0.22)) ** 2 < 1) & \
                    (np.sin(XX * 1.3 + YY * 2.1 + f) > -0.3 + 1.2 * k) & (YY >= wl)
                a[m & (a[..., 3] < 255)] = (*PAL['cloud3'], 220)
        for (t0, cx, size, life) in self.rings:
            dt = (f - t0) % period
            if 1 <= dt <= life:
                rr = size + dt * 1.6
                ring = np.abs(np.hypot((XX - cx) / rr, (YY - wl - 1) / (rr * 0.2)) - 1) < 0.07
                ring &= (YY > wl) & ((XX + f) % 4 != 0)
                al = int(210 * (1 - dt / (life + 1)))
                a[ring & (a[..., 3] == 0)] = (*PAL['haze3'], al)
        for (t0, x, y, vx, vy, sz) in self.drops:
            dt = (f - t0) % period
            if dt > 20:
                continue
            X = x + vx * dt
            Y = y - (vy * dt - 0.22 * dt * dt)
            if Y > wl or not (0 <= int(X) < W - 1 and 0 <= int(Y) < H - 1):
                continue
            c = PAL[('cloud3', 'cloud2', 'haze3')[0 if dt < 5 else (1 if dt < 11 else 2)]]
            for kx in range(sz):
                for ky in range(sz):
                    if int(X) + kx < W and int(Y) + ky < H:
                        a[int(Y) + ky, int(X) + kx] = (*c, 255)


def reflect(a, body, wl, f, tint='water0', alpha=150, squash=1.0, gap=1):
    """Mirror body (RGBA) about the water line into a, darkened and broken by ripples."""
    H, W = body.shape[:2]
    ys, xs = np.nonzero(body[..., 3] > 0)
    if not len(ys):
        return
    tint = np.array(PAL[tint], np.float32)
    for yv, xv in zip(ys, xs):
        if yv >= wl:
            continue
        d = (wl - yv) * squash
        ry = int(wl + d) + gap
        if ry >= H or ry <= wl:
            continue
        rx = int(xv + round(math.sin(ry * 0.9 + f * 0.7) * (0.6 + d * 0.04)))
        if not (0 <= rx < W) or (ry + rx + f) % 5 == 0:
            continue
        c = body[yv, xv, :3].astype(np.float32) * 0.45 + tint * 0.55
        if a[ry, rx, 3] < alpha:
            a[ry, rx] = (*c.astype(np.uint8), alpha)


# ---------------------------------------------------------------- the fox (autumn)
FOX_FUR = ('red0', 'copper1', 'copper2', 'copper3', 'fire3', 'fire4')
FOX_WHITE = ('stone2', 'stone3', 'cloud1', 'cloud2', 'cloud3', 'white')
FOX_BLACK = ('ink', 'gloss0', 'gloss1', 'stone1', 'stone2')
EAR_IN = ('copper1', 'copper2', 'paper2', 'paper3')

# gait keyframes over one bound: phase -> (front upper, front lower, hind upper, hind lower, pitch, crouch)
# angles in degrees from straight down, + = forward
GAIT = [(0.00, 32, 8, -48, -28, -7, 0.0),
        (0.10, -18, -4, 38, 18, 0, 1.0),
        (0.22, -6, -80, -62, -42, 9, 0.3),
        (0.60, 54, 22, -72, -52, 0, -0.2),
        (0.88, 40, 6, -58, -36, -6, 0.0),
        (1.00, 32, 8, -48, -28, -7, 0.0)]


def _gait(ph):
    ph %= 1.0
    for (p0, *a), (p1, *b) in zip(GAIT, GAIT[1:]):
        if p0 <= ph <= p1:
            t = (ph - p0) / (p1 - p0)
            t = t * t * (3 - 2 * t)
            return [x + (y - x) * t for x, y in zip(a, b)]
    return GAIT[0][1:]


def _rot(p, ang, about):
    ca, sa = math.cos(ang), math.sin(ang)
    x, y = p[0] - about[0], p[1] - about[1]
    return (about[0] + x * ca - y * sa, about[1] + x * sa + y * ca, p[2])


def fox_model(S, ox, oy, ph, sc=1.0):
    """Draw the fox into Splat S: (ox, oy) = point on the water under its chest;
    ph = phase of the bound."""
    fu, fl, hu, hl, pitch, crouch = _gait(ph)
    pitch = math.radians(pitch)
    k = sc
    about = (0.0, -14.0)

    def P(x, y, z=0.0):                                   # model -> screen, pitched about the body centre
        q = _rot((x, y, z), pitch, about)
        return (ox + q[0] * k, oy + q[1] * k, q[2] * k)
    crouch_y = 2.5 * crouch
    # the body: chest to haunch, back arching when it gathers itself
    arch = -2.2 * crouch
    spine = [P(4, -16 + crouch_y, 0), P(-4, -17.5 + crouch_y + arch, 0), P(-13, -17 + crouch_y + arch * 0.6, 0),
             P(-21 + 3 * crouch, -16 + crouch_y, 0)]
    S.tube(spine, [8.4 * k, 6.6 * k, 5.9 * k, 6.6 * k], [6.4 * k, 5.4 * k, 5.0 * k, 6.0 * k], mat=1, part=1)
    # neck and head
    neck = [P(5, -18 + crouch_y, 0), P(10, -24 + crouch_y, 0), P(13, -28 + crouch_y, 0)]
    S.tube(neck, [5.8 * k, 5.0 * k, 4.4 * k], [5.0 * k, 4.4 * k, 4.0 * k], mat=1, part=2)
    hx, hy = 15.5, -30.5 + crouch_y
    S.ellipsoid(P(hx, hy, 0), (6.0 * k, 5.2 * k, 5.0 * k), mat=1, rot=pitch, part=3)
    S.ellipsoid(P(hx - 1, hy + 2.8, 0), (5.4 * k, 3.6 * k, 5.2 * k), mat=1, rot=pitch, part=4)   # cheek ruff
    snout = [P(hx + 3, hy + 0.8, 0), P(hx + 7.5, hy + 1.8, 0), P(hx + 11.5, hy + 2.6, 0)]
    S.tube(snout, [3.0 * k, 2.1 * k, 1.1 * k], [2.8 * k, 1.9 * k, 1.0 * k], mat=1, part=5)
    S.ellipsoid(P(hx + 11.8, hy + 2.4, 0.4), (1.2 * k, 1.1 * k, 1.0 * k), mat=3, part=6)              # nose
    S.ellipsoid(P(hx + 3.0, hy - 0.6, 4.2), (1.5 * k, 0.9 * k, 0.8 * k), mat=3, rot=-0.35, part=9)    # the eye
    # ears: big pointed sheets, black at the tips
    for z, mat, back in ((-2.8, 1, 2.6), (2.8, 1, 0.0)):
        base0, base1 = np.array(P(hx - 4.2 - back, hy - 2.6, z)), np.array(P(hx + 2.0 - back, hy - 4.4, z * 0.9))
        tip = np.array(P(hx - 2.6 - back * 1.3, hy - 13.5, z * 1.15))

        def ear(U, V, b0=base0, b1=base1, tp=tip):
            base = b0[None, None, :] * (1 - V[..., None]) + b1[None, None, :] * V[..., None]
            return base * (1 - U[..., None]) + tp[None, None, :] * U[..., None] + \
                np.stack([np.zeros_like(U), np.zeros_like(U), np.sin(math.pi * V) * (1 - U) * 1.2 * k], -1)
        S.sheet(ear, 40, 30, mat=mat, part=7 if z > 0 else 8)
    # legs: hip/shoulder -> knee -> paw; the far pair first and a touch out of step
    for side, dz, dph in ((-1, -3.6, 0.035), (1, 3.6, 0.0)):
        a = _gait(ph + dph)
        for (jx, jy, up, lo, ln_u, ln_l, r0, part, hind) in ((6, -13, a[0], a[1], 10.0, 10.5, 3.6, 10, False),
                                                              (-17, -15, a[2], a[3], 12.5, 12.0, 5.4, 12, True)):
            j = np.array(P(jx, jy + crouch_y, dz))
            au = math.radians(up + pitch * 57.3)
            knee = j + np.array([math.sin(au) * ln_u * k, math.cos(au) * ln_u * k, 0])
            al = math.radians(up + lo + pitch * 57.3)
            paw = knee + np.array([math.sin(al) * ln_l * k, math.cos(al) * ln_l * k, 0])
            pt = part + (side > 0)
            S.tube([j, knee], [r0 * k, 2.4 * k], [r0 * 0.75 * k, 2.1 * k], mat=1, part=pt)
            mid = knee + (paw - knee) * 0.35                 # the leg turns black below the knee
            S.tube([knee, mid], [2.2 * k, 1.8 * k], None, mat=1 if hind else 3, part=pt)
            S.tube([mid, paw], [1.8 * k, 1.35 * k], None, mat=3, part=pt)
            S.ellipsoid(paw + np.array([1.1 * k, 0.4 * k, 0]), (2.0 * k, 1.2 * k, 1.5 * k), mat=3, part=pt)
    # the brush: a big tail streaming out behind, swinging against the bound
    sw = math.sin(2 * math.pi * (ph - 0.15))
    pts = []
    rad = []
    for i in range(12):
        t = i / 11
        ang = math.radians(196 - 18 * sw * t - 14 * t * t)
        x = -21 + math.cos(ang) * 30 * t
        y = -19 + math.sin(ang) * 30 * t - 6 * t * t * sw
        pts.append(P(x, y + crouch_y, -0.5))
        rad.append((2.6 + 5.4 * math.sin(math.pi * min(1, t * 1.1)) ** 0.8) * k)
    S.tube(pts, rad, [r * 0.85 for r in rad], mat=1, part=20)


def fox_paint(S):
    """Fox colouring from where each sample sits: white throat, chest, cheeks and
    tail tip, black ear tips and stockings."""
    m, n, part, u = S.m, S.n, S.part, S.u
    fur = m == 1
    under = n[..., 1] > 0.3
    white = fur & (((part == 2) & under) | ((part == 4) & (n[..., 1] > -0.1))
                   | ((part == 1) & (S.u < 0.14) & (n[..., 1] > 0.2) & (n[..., 0] > 0.1))
                   | ((part == 5) & (n[..., 1] > 0.2)) | ((part == 20) & (u > 0.84)))
    m[white] = 2
    ears = (part == 7) | (part == 8)
    m[ears & (u > 0.62)] = 3
    m[(part == 7) & (u < 0.62) & (S.v > 0.2) & (S.v < 0.8) & (u > 0.12)] = 4      # the near ear's lighter inside
    tail_dark = (part == 20) & (u > 0.22) & (u < 0.84) & (n[..., 1] < -0.55)       # a darker line along the brush
    m[tail_dark & fur] = 5


def fox_frames(horizon):
    w, h = 460, 120
    wl = 92                                                   # water line in the crop
    x0, y0 = 170, horizon + 12 - wl
    run = 64                                                  # frames on screen; the rest is still water
    bound = 10.5                                              # frames per bound
    n_b = run / bound
    start, end = -70, w + 80
    water = Water(w, h, wl, 5)
    touches = []
    for b in range(int(n_b) + 2):
        tf = b * bound
        x = start + (end - start) * (tf / run)
        if 0 <= x < w and tf < run:
            touches.append((tf, x))
            water.splash(tf, x + 6, n=26, power=0.9, spread=4)
            water.splash(tf + 1.2, x - 14, n=18, power=0.7, spread=4)
            water.ripple(tf + 2, x - 4, 2, 34)
    frames = []
    mats = {1: (FOX_FUR, 0.18), 2: (FOX_WHITE, 0.3), 3: (FOX_BLACK, 0.2), 4: (EAR_IN, 0.3),
            5: (('red0', 'red0', 'copper1', 'copper2', 'copper3'), 0.2)}
    for f in range(NG):
        a = np.zeros((h, w, 4), np.uint8)
        water.draw(a, f)
        if f < run + 4:
            ph = f / bound
            x = start + (end - start) * (f / run)
            lift = 26 * max(0.0, math.sin(math.pi * ((ph % 1.0) - 0.16) / 0.84)) if (ph % 1.0) > 0.16 else 0.0
            S = Splat(w, h)
            fox_model(S, x, wl - lift, ph, sc=1.12)
            fox_paint(S)
            body = S.render(mats, line='red0', inner_line=2.0)
            reflect(a, body, wl, f, alpha=140)
            place(a, body, 0, 0)
            # a faint fox-fire wisp trailing it
            for kq in range(3):
                qx = int(x - 40 - kq * 12 + 3 * math.sin(f * 0.7 + kq))
                qy = int(wl - lift - 34 + 4 * math.sin(f * 0.5 + kq * 2))
                for dx, dy, c in ((0, 0, 'cloud3'), (1, 0, 'haze3'), (0, 1, 'haze3'), (-1, 1, 'haze2'), (0, -1, 'haze2')):
                    if 0 <= qx + dx < w and 0 <= qy + dy < h:
                        a[qy + dy, qx + dx] = (*PAL[c], 200 - kq * 50)
        frames.append(a)
    return frames, (x0, y0)


# ---------------------------------------------------------------- the crane (winter)
CRANE_WHITE = ('stone2', 'stone3', 'cloud1', 'cloud2', 'cloud3', 'white')
CRANE_BLACK = ('ink', 'gloss0', 'gloss1', 'gloss2', 'stone1')
CRANE_RED = ('red1', 'scarlet1', 'scarlet2', 'scarlet3')
CRANE_BILL = ('wood1', 'paper0', 'paper1', 'paper2')
CRANE_LEG = ('ink', 'stone0', 'stone1', 'stone2')


def crane_model(S, ox, oy, flap, sc=1.0, tilt=0.6, yaw=-0.7, bank=0.0):
    """The crane flying to the right (the frames are mirrored to fly left), seen a
    little from below and turned a little away, so the spread wings show their
    shape. flap: wing angle in radians (+ up)."""
    k = sc
    ct, st = math.cos(tilt), math.sin(tilt)
    cy_, sy_ = math.cos(yaw), math.sin(yaw)
    cb, sb = math.cos(bank), math.sin(bank)

    def xf(p):
        p = np.asarray(p, float)
        x, y, z = p[..., 0], p[..., 1], p[..., 2]
        x1 = x * cy_ + z * sy_
        z1 = -x * sy_ + z * cy_
        y2 = y * ct - z1 * st
        z2 = y * st + z1 * ct
        return np.stack([ox + (x1 * cb - y2 * sb) * k, oy + (x1 * sb + y2 * cb) * k, z2 * k], -1)
    P_ = lambda pts: xf(np.array(pts, float))
    # body: a long white spindle
    S.tube(P_([(14, -1, 0), (6, -2, 0), (-6, -1.5, 0), (-16, 0.5, 0)]), [3.0 * k, 5.4 * k, 5.2 * k, 2.6 * k],
           [3.0 * k, 5.2 * k, 5.0 * k, 2.4 * k], mat=1, part=1)
    # neck stretched out ahead, black; small head with the red crown; long bill
    S.tube(P_([(13, -1.5, 0), (22, -2.6, 0), (31, -3.4, 0), (38, -3.6, 0)]), [2.6 * k, 1.9 * k, 1.6 * k, 1.5 * k],
           None, mat=2, part=2)
    S.ellipsoid(P_([(40, -4.0, 0)])[0], (2.6 * k, 2.1 * k, 2.0 * k), mat=2, part=3)
    S.tube(P_([(42, -3.8, 0), (46, -3.3, 0), (50, -2.6, 0)]), [0.9 * k, 0.6 * k, 0.35 * k], None, mat=4, part=4)
    # legs trailing behind the tail, feet together
    for dz in (-0.8, 0.8):
        S.tube(P_([(-12, 1.5, dz), (-22, 2.2, dz), (-34, 2.6, dz * 0.5)]), [0.9 * k, 0.75 * k, 0.6 * k], None, mat=5,
               part=5)
    S.ellipsoid(P_([(-19, 0.6, 0)])[0], (4.8 * k, 2.6 * k, 3.4 * k), mat=1, part=6)          # tail
    # wings: span out to the sides, swung up and down about the body axis, the
    # hand bending at the wrist and lagging the beat; long primaries splayed like fingers
    for side in (-1, 1):
        th_in = flap
        th_out = flap * 1.3 - 0.12

        def wing(U, V, side=side, th_in=th_in, th_out=th_out):
            span = 50.0
            wrist = 0.48
            lead = 6.0 - 9.0 * U ** 1.5                      # swept back toward the tip
            chord = (16.0 - 6.0 * U)
            finger = (U > 0.66) * (0.5 + 0.5 * np.cos(U * 2 * math.pi * 7.5)) * (U - 0.66) * 18
            depth = lead - V * (chord + finger)
            r_in = np.minimum(U, wrist) * span
            r_out = np.maximum(U - wrist, 0) * span
            yy = -np.sin(th_in) * r_in - np.sin(th_out) * r_out
            zz = np.cos(th_in) * r_in + np.cos(th_out) * r_out
            return xf(np.stack([depth + 2.0, yy - 2.0, zz * side], -1))

        def wing_mask(U, V):
            return ~((U > 0.66) & (V > 0.72 + 0.28 * (0.5 + 0.5 * np.cos(U * 2 * math.pi * 7.5))))
        S.sheet(wing, 220, 48, mat=6, part=10 if side > 0 else 11, mask=wing_mask)


def crane_paint(S):
    m, part, u, v = S.m, S.part, S.u, S.v
    wing = (part == 10) | (part == 11)
    m[wing & (u < 0.64) & (v > 0.58)] = 2                   # black secondaries along the trailing edge
    m[wing & (u < 0.64) & (v > 0.5) & (v <= 0.58) & ((S.u * 90).astype(int) % 2 == 0)] = 2   # feathered edge
    m[(part == 3) & (S.n[..., 1] < -0.35) & (S.n[..., 0] < 0.4)] = 3     # the red crown
    nape = (part == 2) & (u < 0.45) & (S.n[..., 1] < -0.2)
    m[nape] = 1                                             # white down the back of the neck


def crane_frames(horizon):
    w, h = 470, 170
    wl = 140
    x0, y0 = 160, horizon + 12 - wl
    mats = {1: (CRANE_WHITE, 0.32), 2: (CRANE_BLACK, 0.2), 3: (CRANE_RED, 0.3), 4: (CRANE_BILL, 0.3),
            5: (CRANE_LEG, 0.2), 6: (('stone3', 'cloud1', 'cloud2', 'cloud3', 'white', 'white'), 0.55, True)}
    water = Water(w, h, wl, 6)
    fly = 92                                                 # frames crossing
    beat = 15.0                                              # frames per wingbeat
    path = []
    for f in range(fly + 1):
        t = f / fly
        x = w + 90 - (w + 200) * t                           # right to left
        y = wl - 72 + 46 * math.sin(math.pi * min(1, t * 1.15)) ** 1.5 - 22 * max(0.0, t - 0.75) / 0.25
        path.append((x, y))
    # where the wingtips brush the water (the low part of the glide, on downstrokes)
    for f in range(0, fly, 3):
        x, y = path[f]
        flap = _flap(f, beat)
        if wl - y < 32 and flap < -0.25 and 0 < x < w:
            water.ripple(f, x + 6, 2, 30)
            water.splash(f, x + 6, n=8, power=0.5, spread=8)
    frames = []
    light = LIGHT * np.array([-1, 1, 1])                     # mirrored, so the light stays upper left
    for f in range(NG):
        a = np.zeros((h, w, 4), np.uint8)
        water.draw(a, f)
        if f <= fly:
            x, y = path[f]
            S = Splat(w, h)
            # drawn flying right at the mirrored spot, then flipped
            crane_model(S, w - 1 - x, y, _flap(f, beat), sc=1.25, bank=0.05 * math.sin(f / 9.0))
            crane_paint(S)
            body = S.render(mats, light=light, line='stone1', inner_line=3.0)[:, ::-1]
            reflect(a, body, wl, f, alpha=120, squash=1.0, gap=2)
            place(a, body, 0, 0)
        frames.append(a)
    return frames, (x0, y0)


def _flap(f, beat):
    """Wing angle: a quick strong downstroke, a slower upstroke, held up a moment."""
    p = (f % beat) / beat
    return math.radians(-26 + 64 * (0.5 + 0.5 * math.cos(2 * math.pi * p + 0.3 * math.sin(2 * math.pi * p))))


# ---------------------------------------------------------------- the koi (spring)
KOI_WHITE = ('stone2', 'stone3', 'cloud2', 'cloud3', 'white', 'white')
KOI_RED = ('red0', 'red1', 'scarlet1', 'scarlet2', 'scarlet3', 'fire4')
KOI_BLACK = ('ink', 'gloss0', 'gloss1', 'gloss2')
KOI_FIN = ('stone3', 'cloud1', 'cloud2', 'cloud3', 'white')


def _koi_arc(span, height, n=500):
    u = np.linspace(-0.6, 1.6, n)
    x = span * u
    y = -4 * height * u * (1 - u)
    s = np.concatenate([[0], np.cumsum(np.hypot(np.diff(x), np.diff(y)))])
    return x, y, s, u


def koi_model(Sb, Sfar, Snear, ax, ay, asl, sh, length, f, sc=1.0):
    """The koi along its leap arc, head at arc length sh. Body into Sb; the fins on
    the far side into Sfar, the near fins, dorsal and tail into Snear (they are
    see-through, so they are laid over separately)."""
    n = 70
    Sarc = np.linspace(sh, sh - length, n)
    px = np.interp(Sarc, asl, ax)
    py = np.interp(Sarc, asl, ay)
    t = np.linspace(0, 1, n)
    tx, ty = np.gradient(px), np.gradient(py)
    tl = np.hypot(tx, ty) + 1e-6
    nx, ny = -ty / tl, tx / tl
    flip = np.where(ny < 0, -1.0, 1.0)                       # the normal points to the belly side (down)
    nx, ny = nx * flip, ny * flip
    wave = 2.6 * t ** 1.6 * np.sin(2 * math.pi * (t * 1.1 - f / 8.0))   # swimming: a wave down the body
    zz = wave * 2.0
    px = px + nx * wave * 0.25
    py = py + ny * wave * 0.25
    prof = np.where(t < 0.12, 0.62 + 0.38 * np.sqrt(t / 0.12),
                    np.where(t < 0.4, 1.0, np.clip(1 - (t - 0.4) / 0.6, 0.0, 1) ** 1.25 * 0.92 + 0.08))
    R = 9.0 * sc * prof
    spine = np.stack([px, py, zz], 1)
    Sb.tube(spine, R, R * 0.78, mat=1, part=1)
    # eye and mouth
    for side in (-1, 1):
        e = spine[4] + np.array([-nx[4] * R[4] * 0.25, -ny[4] * R[4] * 0.25, side * R[4] * 0.62])
        Sb.ellipsoid(e, (1.1, 1.1, 0.8), mat=3, part=2)
    T0 = np.array([tx[0], ty[0], 0]) / tl[0]
    N0 = np.array([nx[0], ny[0], 0.0])
    head = spine[0]
    for side in (-1, 1):                                       # barbels
        Snear.tube([head + N0 * 3.0 + T0 * 1.5 + np.array([0, 0, side * 3]),
                    head + N0 * 6.5 - T0 * 2.5 + np.array([0, 0, side * 5.5])], [0.6, 0.4], None, mat=4, part=9)

    def fin(i, length_, width_, side, S, part, phase=0.0, down=1.0):
        i = int(i)
        base = spine[i] + np.array([nx[i] * R[i] * 0.85 * down, ny[i] * R[i] * 0.85 * down, side * R[i] * 0.45])
        T = np.array([tx[i], ty[i], 0]) / tl[i]
        Nn = np.array([nx[i], ny[i], 0.0]) * down

        def fn(U, V, base=base, T=T, Nn=Nn):
            Ue, Ve = U[..., None], V[..., None]
            back = -T * (Ue * length_)
            out = Nn * (Ue * width_ * (0.35 + Ve))
            flow = np.array([0, 0, 1.0]) * (side * (2.0 + 5.0 * Ue) + 2.0 * np.sin(5 * Ue - f / 1.6 + phase) * Ue)
            ripple = Nn * (np.sin(8 * Ue + Ve * 2.5 - f / 1.3 + phase) * Ue * 1.8)
            return base + back + out + flow + ripple + (Ve - 0.5) * T * 4
        S.sheet(fn, 80, 30, mat=4, part=part,
                mask=lambda U, V: V < (1 - 0.6 * U ** 1.5) * (0.82 + 0.18 * np.sin(U * 13 + phase)))
    fin(n * 0.18, 22 * sc, 15 * sc, 1, Snear, 5, phase=0.0)                # pectorals, long and flowing
    fin(n * 0.18, 21 * sc, 14 * sc, -1, Sfar, 6, phase=1.0)
    fin(n * 0.5, 14 * sc, 9 * sc, 1, Snear, 7, phase=0.4)                  # pelvic
    fin(n * 0.3, 28 * sc, 8 * sc, 0.0, Snear, 8, phase=0.7, down=-1.0)     # dorsal, along the back
    # the tail: a big flowing fan
    i = n - 2
    T = np.array([tx[i], ty[i], 0]) / tl[i]
    Nn = np.array([nx[i], ny[i], 0.0])
    base = spine[i]

    def tail(U, V):
        Ue, Ve = U[..., None], V[..., None]
        spread = (Ve - 0.5) * 2
        back = -T * (Ue * 32 * sc)
        fan = Nn * spread * (3 + 19 * Ue) * sc
        wav = np.array([0, 0, 1.0]) * (5 * np.sin(4 * Ue - f / 2.2) * Ue + spread * 2)
        curl = Nn * (np.sin(6 * Ue - f / 1.5) * Ue * 2.5)
        return base + back + fan + wav + curl
    Snear.sheet(tail, 80, 46, mat=4, part=10,
                mask=lambda U, V: U < 0.5 + 0.5 * np.abs((V - 0.5) * 2) ** 0.6 - 0.06 * np.abs(np.sin(V * 13 + f / 3.0)))
    return spine


def koi_paint(S):
    m, u, v, part, n = S.m, S.u, S.v, S.part, S.n
    body = (part == 1) & (m == 1)
    dorsal = n[..., 1] < 0.35
    edge = 0.06 * np.sin(v * 6.28 * 3 + u * 20) + 0.04 * np.sin(u * 47)
    patch = ((u > 0.08 + edge) & (u < 0.27 + edge)) | ((u > 0.44 + edge) & (u < 0.63 - edge))
    red = body & (n[..., 1] < 0.05) & patch
    red |= body & (u < 0.07) & (n[..., 1] < -0.2)               # a red cap on the head
    m[red] = 2
    sumi = body & (np.sin(u * 41 + v * 19) * np.sin(u * 23 - v * 31) > 0.9) & (u > 0.3) & (u < 0.8) & dorsal
    m[sumi] = 3
    # scales: a fine net that catches the light on the back
    net = body & ((np.abs(((u * 80) % 1) - 0.5) + np.abs(((v * 30) % 1) - 0.5)) < 0.1)
    S.n[net] = _unit(S.n[net] + np.array([-0.35, -0.45, 0.25], np.float32))


def koi_fins_paint(S):
    m, u = S.m, S.u
    fin = m == 4
    m[fin & ((S.v * 14).astype(int) % 3 == 0) & (u > 0.15)] = 5     # fin rays, a blush of pink
    m[fin & (u < 0.18)] = 6                                    # orange where the fins join the body


def koi_frames(horizon):
    w, h = 440, 160
    wl = 118
    x0, y0 = 190, horizon + 12 - wl
    span, height, length = 120, 64, 86
    ax, ay, asl, au = _koi_arc(span, height)
    bx = 140                                                  # where it leaves the water
    ax = ax + bx
    ay = ay + wl
    s_out = np.interp(0.0, au, asl)
    s_in = np.interp(1.0, au, asl)
    t_up, t_end = 24, 84
    speed = (s_in + length + 10 - s_out) / (t_end - t_up)
    water = Water(w, h, wl, 7)
    water.splash(t_up, bx + 4, n=90, power=1.4, spread=7)
    t_in = t_up + (s_in - s_out) / speed
    water.splash(t_in, bx + span, n=160, power=1.8, spread=10)
    water.splash(t_in + 6, bx + span - 6, n=60, power=1.0, spread=10)
    water.ripple(t_in + 5, bx + span, 7, 44)
    water.ripple(t_up - 10, bx - 20, 4, 30)                  # the swell before it breaks the surface
    mats = {1: (KOI_WHITE, 0.32), 2: (KOI_RED, 0.25), 3: (KOI_BLACK, 0.2), 4: (KOI_FIN, 0.45, True)}
    fmats = {4: (('cloud2', 'cloud3', 'white', 'white'), 0.6, True), 5: (('pink2', 'pink3', 'pink4', 'cloud3'), 0.5, True),
             6: (('fire3', 'fire4', 'pink4', 'white'), 0.6, True)}
    frames = []
    for f in range(NG):
        a = np.zeros((h, w, 4), np.uint8)
        water.draw(a, f)
        sh = s_out + (f - t_up) * speed
        if t_up - 1 <= f <= t_end + 2:
            Sb, Sf, Sn = Splat(w, h), Splat(w, h), Splat(w, h)
            koi_model(Sb, Sf, Sn, ax, ay, asl, sh, length, f, sc=1.18)
            koi_paint(Sb)
            koi_fins_paint(Sf)
            koi_fins_paint(Sn)
            far = Sf.render(fmats, line='cloud1', inner_line=0)
            body = Sb.render(mats, line='red0', inner_line=2.0)
            near = Sn.render(fmats, line='cloud1', inner_line=0)
            koi = np.zeros_like(a)
            place(koi, far, 0, 0, alpha=0.75)
            place(koi, body, 0, 0)
            place(koi, near, 0, 0, alpha=0.85)
            under = np.zeros((h, w), bool)
            under[wl + 1:] = True
            sub = koi[..., 3] > 0
            a[sub & under] = (*PAL['water1'], 110)            # below the surface: only a pale shape shows
            koi[under] = 0
            reflect(a, koi, wl, f, alpha=130)
            place(a, koi, 0, 0)
        # petals floating where it broke the water
        g = random.Random(11)
        for _ in range(50):
            px_ = int(bx + g.uniform(-60, span + 70) + 2 * math.sin(f / 10 + g.random() * 6))
            py_ = wl + 1 + int(g.random() ** 1.5 * 30)
            if 0 <= px_ < w - 1 and py_ < h and a[py_, px_, 3] < 200:
                a[py_, px_] = (*PAL[g.choice(('pink4', 'pink3', 'white'))], 255)
        frames.append(a)
    return frames, (x0, y0)


def frames(season, horizon):
    return dict(spring=koi_frames, autumn=fox_frames, winter=crane_frames)[season](horizon)
