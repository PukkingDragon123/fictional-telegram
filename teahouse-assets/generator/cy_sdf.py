"""A sculpting kit for the copper animals: each one is a signed distance
field made of a few kinds of shape, blended into one surface (smooth union)
or carved away (subtraction), and ray-marched straight into a sprite.

    S = Shapes()
    S.ell(centre, radii, rot=None, k=0, mat=1)          # ellipsoid
    S.cap(a, b, r0, r1=None, k=0, mat=1)                 # tapered capsule (spikes, legs, struts)
    S.box(centre, half, rot=None, round=0, k=0, mat=1)   # rounded box
    S.cut(...)                                           # any of the above, subtracted
    g = S.trace(w, h, scale, origin, view)               # per-pixel buffers

Rays are parallel (a sprite is drawn the way a pixel artist draws it: no
lens), and the surface is taken a third of a pixel out from the true one so
a leg or a spike thinner than a pixel still comes out as an unbroken line.
The buffers - hit, normal (view space), material, the point hit in the
object's own space, occlusion and depth - are styled into pixels by the
caller."""
import math
import numpy as np
from numba import njit

ELL, CAP, BOX = 0, 1, 2
UNION, SUB = 0, 1


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class Shapes:
    def __init__(self):
        self.rows = []

    def _add(self, kind, op, k, mat, a, b, r, rot):
        rot = np.eye(3) if rot is None else np.asarray(rot, float)
        # the kernel wants world -> shape, i.e. the inverse (transpose) of the shape's orientation
        self.rows.append((kind, op, k, mat, tuple(a), tuple(b), tuple(r), rot.T.reshape(9)))

    def ell(self, c, r, rot=None, k=0.0, mat=1, op=UNION):
        self._add(ELL, op, k, mat, c, (0, 0, 0), r, rot)

    def cap(self, a, b, r0, r1=None, k=0.0, mat=1, op=UNION):
        self._add(CAP, op, k, mat, a, b, (r0, r0 if r1 is None else r1, 0), None)

    def box(self, c, half, rot=None, round=0.0, k=0.0, mat=1, op=UNION):
        self._add(BOX, op, k, mat, c, half, (round, 0, 0), rot)

    def cut(self, kind, *a, **kw):
        getattr(self, kind)(*a, op=SUB, **kw)

    def arrays(self):
        R = self.rows
        return (np.array([q[0] for q in R], np.int64), np.array([q[1] for q in R], np.int64),
                np.array([q[2] for q in R], np.float64), np.array([q[3] for q in R], np.int64),
                np.array([q[4] for q in R], np.float64), np.array([q[5] for q in R], np.float64),
                np.array([q[6] for q in R], np.float64), np.array([q[7] for q in R], np.float64))

    def trace(self, w, h, scale, origin, view, bound=None, steps=96):
        """Render into a w x h sprite. `scale` px per unit, `origin` the pixel
        the object's (0,0,0) lands on, `view` the 3x3 rotation object -> view
        (view: x right, y up, z toward the viewer)."""
        kinds, ops, ks, mats, A, B, Rr, M = self.arrays()
        if bound is None:
            ext = np.abs(A).max(1) + np.abs(Rr[:, :2]).max(1) + np.abs(B).max(1)
            bound = float(ext.max()) * 1.2
        g = dict(hit=np.zeros((h, w), np.bool_), n=np.zeros((h, w, 3)), mat=np.zeros((h, w), np.int64),
                 p=np.zeros((h, w, 3)), ao=np.ones((h, w)), z=np.full((h, w), -1e9))
        _trace(w, h, float(scale), float(origin[0]), float(origin[1]), np.asarray(view, np.float64), float(bound),
               steps, kinds, ops, ks, mats, A, B, Rr, M, g['hit'], g['n'], g['mat'], g['p'], g['ao'], g['z'])
        return g


@njit(cache=True, fastmath=True, inline='always')
def _prim(px, py, pz, kind, a, b, r, m):
    if kind == 1:                                           # tapered capsule (round cone)
        bx, by, bz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        ax, ay, az = px - a[0], py - a[1], pz - a[2]
        bb = bx * bx + by * by + bz * bz
        h = 0.0
        if bb > 1e-12:
            h = min(1.0, max(0.0, (ax * bx + ay * by + az * bz) / bb))
        dx, dy, dz = ax - bx * h, ay - by * h, az - bz * h
        return math.sqrt(dx * dx + dy * dy + dz * dz) - (r[0] + (r[1] - r[0]) * h)
    qx0, qy0, qz0 = px - a[0], py - a[1], pz - a[2]
    qx = m[0] * qx0 + m[1] * qy0 + m[2] * qz0
    qy = m[3] * qx0 + m[4] * qy0 + m[5] * qz0
    qz = m[6] * qx0 + m[7] * qy0 + m[8] * qz0
    if kind == 0:                                           # ellipsoid (bound-corrected)
        k0x, k0y, k0z = qx / r[0], qy / r[1], qz / r[2]
        k0 = math.sqrt(k0x * k0x + k0y * k0y + k0z * k0z)
        k1x, k1y, k1z = qx / (r[0] * r[0]), qy / (r[1] * r[1]), qz / (r[2] * r[2])
        k1 = math.sqrt(k1x * k1x + k1y * k1y + k1z * k1z)
        if k1 < 1e-9:
            return -min(r[0], min(r[1], r[2]))
        return k0 * (k0 - 1.0) / k1
    rr = r[0]                                               # rounded box: b = half extents
    dx = abs(qx) - b[0] + rr
    dy = abs(qy) - b[1] + rr
    dz = abs(qz) - b[2] + rr
    ox, oy, oz = max(dx, 0.0), max(dy, 0.0), max(dz, 0.0)
    return math.sqrt(ox * ox + oy * oy + oz * oz) + min(max(dx, max(dy, dz)), 0.0) - rr


@njit(cache=True, fastmath=True)
def _sdf(px, py, pz, kinds, ops, ks, mats, A, B, R, M):
    d = 1e9
    m = 0
    best = 1e9
    for i in range(kinds.shape[0]):
        di = _prim(px, py, pz, kinds[i], A[i], B[i], R[i], M[i])
        k = ks[i]
        if ops[i] == 0:
            if di < best:
                best = di
                m = mats[i]
            if k > 0:
                h = min(1.0, max(0.0, 0.5 + 0.5 * (d - di) / k))
                d = d * (1 - h) + di * h - k * h * (1 - h)
            else:
                d = min(d, di)
        else:
            nd_ = -di
            if k > 0:
                h = min(1.0, max(0.0, 0.5 - 0.5 * (nd_ - d) / k))
                nd = nd_ * (1 - h) + d * h + k * h * (1 - h)
            else:
                nd = max(d, nd_)
            if nd_ > d - 1e-4 and mats[i] != 0:
                m = mats[i]
            d = nd
    return d, m


@njit(cache=True, fastmath=True)
def _trace(w, h, scale, ox, oy, V, bound, steps, kinds, ops, ks, mats, A, B, R, M, hit, nrm, mat, pos, ao, zb):
    th = 0.34 / scale                                       # a third of a pixel: thin parts stay unbroken
    eps = 0.25 / scale
    for py in range(h):
        for px in range(w):
            vx = (px + 0.5 - ox) / scale
            vy = -(py + 0.5 - oy) / scale
            if vx * vx + vy * vy > bound * bound:
                continue
            zs = math.sqrt(bound * bound - vx * vx - vy * vy)
            # view ray (vx, vy, z), z from +zs down to -zs; object point = V^T @ view point
            t = 0.0
            L = 2 * zs
            found = False
            qx = qy = qz = 0.0
            m = 0
            for it in range(steps):
                z = zs - t
                qx = V[0, 0] * vx + V[1, 0] * vy + V[2, 0] * z
                qy = V[0, 1] * vx + V[1, 1] * vy + V[2, 1] * z
                qz = V[0, 2] * vx + V[1, 2] * vy + V[2, 2] * z
                d, m = _sdf(qx, qy, qz, kinds, ops, ks, mats, A, B, R, M)
                d -= th
                if d < 0.02 / scale:
                    found = True
                    break
                t += max(d * 0.9, 0.05 / scale)
                if t > L:
                    break
            if not found:
                continue
            gx = _sdf(qx + eps, qy, qz, kinds, ops, ks, mats, A, B, R, M)[0] - \
                _sdf(qx - eps, qy, qz, kinds, ops, ks, mats, A, B, R, M)[0]
            gy = _sdf(qx, qy + eps, qz, kinds, ops, ks, mats, A, B, R, M)[0] - \
                _sdf(qx, qy - eps, qz, kinds, ops, ks, mats, A, B, R, M)[0]
            gz = _sdf(qx, qy, qz + eps, kinds, ops, ks, mats, A, B, R, M)[0] - \
                _sdf(qx, qy, qz - eps, kinds, ops, ks, mats, A, B, R, M)[0]
            gl = math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-12
            gx /= gl
            gy /= gl
            gz /= gl
            # occlusion: how much is near along the normal
            occ = 0.0
            for s in range(1, 4):
                hd = s * 2.2 / scale
                ds = _sdf(qx + gx * hd, qy + gy * hd, qz + gz * hd, kinds, ops, ks, mats, A, B, R, M)[0]
                occ += max(0.0, hd - ds) / hd / s
            hit[py, px] = True
            nrm[py, px, 0] = V[0, 0] * gx + V[0, 1] * gy + V[0, 2] * gz
            nrm[py, px, 1] = V[1, 0] * gx + V[1, 1] * gy + V[1, 2] * gz
            nrm[py, px, 2] = V[2, 0] * gx + V[2, 1] * gy + V[2, 2] * gz
            mat[py, px] = m
            pos[py, px, 0] = qx
            pos[py, px, 1] = qy
            pos[py, px, 2] = qz
            ao[py, px] = max(0.0, 1.0 - occ * 0.55)
            zb[py, px] = zs - t
