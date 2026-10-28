"""Its face, sculpted: one smooth surface ray-marched as a signed distance
field, so the brow, the cheekbones, the nose, the jaw and the lips flow into
each other like a real face instead of being stuck together.

The shapes are blended (smooth union) and carved (smooth subtraction):
cranium and face, a hard jawline and a narrow chin, high cheekbones over
hollow cheeks, a straight narrow nose, the brow ridge, the lips; the eye
sockets cut in deep, the eyes set in them under heavy lids; and the grin cut
across it all, lined with too many teeth, opening as the jaw comes loose. The
creases darken by themselves (occlusion sampled along the normal).

In the head's own frame (x right, y up, z out of the face), head units
(the head is about 0.23 tall); the creature scales it to metres.
"""
import math

import numpy as np
from numba import njit

SKIN, TOOTH, LIP, MOUTH, EYE, EYEBALL = 15, 16, 17, 13, 9, 19
ELL, CAP = 0, 1
UNION, SUB = 0, 1


def build(expr):
    """The face's shapes for this expression: arrays for the kernel."""
    g, j, lids = expr['grin'], expr['jaw'], expr['lids']
    jd = 0.05 * j
    S = []                                 # (kind, op, k, mat, a(3), b(3), r(3))

    def ell(c, r, op=UNION, k=0.0, mat=SKIN):
        S.append((ELL, op, k, mat, c, (0, 0, 0), r))

    def cap(a, b, r, op=UNION, k=0.0, mat=SKIN):
        S.append((CAP, op, k, mat, a, b, (r, r, r)))
    ell((0, 0.035, -0.012), (0.082, 0.097, 0.095))
    ell((0, -0.004, 0.028), (0.067, 0.092, 0.07), k=0.022)
    ell((0, -0.06 - jd, 0.034 - 0.3 * jd), (0.056, 0.03, 0.058), k=0.018)
    ell((0, -0.086 - jd, 0.068 - 0.3 * jd), (0.019, 0.015, 0.016), k=0.012)
    for s in (-1, 1):
        cap((0.062 * s, -0.018, -0.004), (0.02 * s, -0.082 - jd, 0.066 - 0.3 * jd), 0.008, k=0.012)   # jawline
        ell((0.046 * s, 0.002, 0.064), (0.023, 0.011, 0.025), k=0.012)                                # cheekbones
        ell((0.08 * s, 0.0, -0.002), (0.008, 0.024, 0.015), k=0.006)                                  # ears
    cap((-0.05, 0.031, 0.079), (0.05, 0.031, 0.079), 0.0105, k=0.016)                                 # brow ridge
    cap((0, 0.024, 0.093), (0, -0.011, 0.103), 0.006, k=0.01)                                         # nose
    ell((0, -0.016, 0.1), (0.0085, 0.0075, 0.008), k=0.007)
    for s in (-1, 1):
        ell((0.0075 * s, -0.019, 0.096), (0.0048, 0.0042, 0.0045), k=0.004)                           # nostril wings
        ell((0.044 * s, -0.03, 0.071), (0.02, 0.017, 0.011), op=SUB, k=0.014)                        # hollow cheeks
        ell((0.03 * s, 0.016, 0.088), (0.0175, 0.0092, 0.012), op=SUB, k=0.007)                     # eye sockets
    cap((0, -0.06, -0.02), (0, -0.2, -0.03), 0.034, k=0.02)                                           # neck
    # the lips
    cap((-0.019 - 0.006 * g, -0.041 + 0.01 * g, 0.092), (0.0, -0.043, 0.095), 0.0052, k=0.006, mat=LIP)
    cap((0.0, -0.043, 0.095), (0.019 + 0.006 * g, -0.041 + 0.01 * g, 0.092), 0.0052, k=0.006, mat=LIP)
    cap((-0.016, -0.052 - jd, 0.09 - 0.25 * jd), (0.016, -0.052 - jd, 0.09 - 0.25 * jd), 0.006, k=0.006, mat=LIP)
    # the grin: cut across, past the corners of the mouth and on into the cheeks
    wg = 0.022 + 0.052 * g
    n = 12
    pts = []
    for i in range(n + 1):
        u = (i / n) * 2 - 1
        x = u * wg
        pts.append((x, -0.047 + 7.0 * g * x * x - 0.5 * jd * (1 - u * u), 0.097 - 5.5 * x * x))
    for i in range(n):
        u = ((i + 0.5) / n) * 2 - 1
        h = 0.0016 + 0.0032 * g * (1 - abs(u)) + 0.5 * jd * (1 - u * u) ** 0.5
        cap(pts[i], pts[i + 1], h, op=SUB, k=0.0015, mat=MOUTH)
    if g > 0.15:                                                     # too many teeth
        for i in range(1, 2 * n):
            u = (i / (2 * n)) * 2 - 1
            x = u * wg
            y = -0.047 + 7.0 * g * x * x - 0.5 * jd * (1 - u * u)
            z = 0.095 - 5.5 * x * x
            h = 0.0016 + 0.0032 * g * (1 - abs(u)) + 0.5 * jd * (1 - u * u) ** 0.5
            ell((x, y + h * 0.55, z - 0.002), (wg / n * 0.36, 0.0026, 0.004), mat=TOOTH)
            if j > 0.15:
                ell((x, y - h * 0.55, z - 0.002), (wg / n * 0.36, 0.0024, 0.004), mat=TOOTH)
    # the eyes, deep in the sockets, under heavy lids
    for s in (-1, 1):
        ell((0.03 * s, 0.015, 0.079), (0.0108, 0.0085, 0.0085), mat=EYEBALL)
        ell((0.03 * s, 0.015, 0.0868), (0.0042, 0.0042, 0.0018), mat=EYE)
        lid = 0.0215 - 0.0085 * lids
        cap((0.03 * s - 0.016 * s, 0.019, 0.083), (0.03 * s + 0.017 * s, lid + 0.003, 0.08), 0.0062, k=0.004)
    kinds = np.array([q[0] for q in S], np.int64)
    ops = np.array([q[1] for q in S], np.int64)
    ks = np.array([q[2] for q in S], np.float64)
    mats = np.array([q[3] for q in S], np.int64)
    A = np.array([q[4] for q in S], np.float64)
    B = np.array([q[5] for q in S], np.float64)
    R = np.array([q[6] for q in S], np.float64)
    return kinds, ops, ks, mats, A, B, R


@njit(cache=True, fastmath=True, inline='always')
def _prim(px, py, pz, kind, a, b, r):
    if kind == 0:
        qx = (px - a[0]) / r[0]
        qy = (py - a[1]) / r[1]
        qz = (pz - a[2]) / r[2]
        L = math.sqrt(qx * qx + qy * qy + qz * qz)
        return (L - 1.0) * min(r[0], min(r[1], r[2]))
    bx, by, bz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    ax, ay, az = px - a[0], py - a[1], pz - a[2]
    bb = bx * bx + by * by + bz * bz
    h = 0.0
    if bb > 1e-12:
        h = min(1.0, max(0.0, (ax * bx + ay * by + az * bz) / bb))
    dx, dy, dz = ax - bx * h, ay - by * h, az - bz * h
    return math.sqrt(dx * dx + dy * dy + dz * dz) - r[0]


@njit(cache=True, fastmath=True)
def _sdf(px, py, pz, kinds, ops, ks, mats, A, B, R):
    """Distance, and the material of the shape that made the surface here."""
    d = 1e9
    m = 15
    for i in range(kinds.shape[0]):
        di = _prim(px, py, pz, kinds[i], A[i], B[i], R[i])
        k = ks[i]
        if ops[i] == 0:
            if k > 0:
                h = min(1.0, max(0.0, 0.5 + 0.5 * (d - di) / k))
                nd = d * (1 - h) + di * h - k * h * (1 - h)
            else:
                nd = min(d, di)
            if di < d + 1e-5 and (mats[i] != 15 or di < d - k * 0.25):
                m = mats[i]
            d = nd
        else:
            nd_ = -di
            if k > 0:
                h = min(1.0, max(0.0, 0.5 - 0.5 * (nd_ - d) / k))
                nd = nd_ * (1 - h) + d * h + k * h * (1 - h)
            else:
                nd = max(d, nd_)
            if nd_ > d - 1e-4 and mats[i] == 13:
                m = 13
            d = nd
    return d, m


@njit(cache=True, fastmath=True)
def trace(eye, R, focal, Rh, head, scale, bx0, bx1, by0, by1, kinds, ops, ks, mats, A, B, Rr, eyes, depth, nrm, mat,
          oid, var, att, aux, ao, oid0):
    """March every ray in the box into the face; write what it hits."""
    Hd, Wd = depth.shape
    # the camera in the head's frame
    ex = eye[0] - head[0]
    ey = eye[1] - head[1]
    ez = eye[2] - head[2]
    ox = (Rh[0, 0] * ex + Rh[1, 0] * ey + Rh[2, 0] * ez) / scale
    oy = (Rh[0, 1] * ex + Rh[1, 1] * ey + Rh[2, 1] * ez) / scale
    oz = (Rh[0, 2] * ex + Rh[1, 2] * ey + Rh[2, 2] * ez) / scale
    for py in range(by0, by1 + 1):
        for px in range(bx0, bx1 + 1):
            xc = (px + 0.5 - Wd * 0.5) / focal
            yc = -(py + 0.5 - Hd * 0.5) / focal
            dx = xc * R[0, 0] + yc * R[1, 0] + R[2, 0]
            dy = xc * R[0, 1] + yc * R[1, 1] + R[2, 1]
            dz = xc * R[0, 2] + yc * R[1, 2] + R[2, 2]
            nl = math.sqrt(dx * dx + dy * dy + dz * dz)
            dx /= nl
            dy /= nl
            dz /= nl
            lx = Rh[0, 0] * dx + Rh[1, 0] * dy + Rh[2, 0] * dz
            ly = Rh[0, 1] * dx + Rh[1, 1] * dy + Rh[2, 1] * dz
            lz = Rh[0, 2] * dx + Rh[1, 2] * dy + Rh[2, 2] * dz
            # start where the ray enters the bounding sphere
            bc = ox * lx + oy * ly + oz * lz
            cc = ox * ox + oy * oy + oz * oz - 0.2 * 0.2
            disc = bc * bc - cc
            if disc < 0:
                continue
            t = max(0.0, -bc - math.sqrt(disc))
            t_end = -bc + math.sqrt(disc)
            hit = False
            m = 15
            for it in range(110):
                qx = ox + lx * t
                qy = oy + ly * t
                qz = oz + lz * t
                d, m = _sdf(qx, qy, qz, kinds, ops, ks, mats, A, B, Rr)
                if d < 0.0002:
                    hit = True
                    break
                t += d * 0.8
                if t > t_end:
                    break
            if not hit:
                continue
            dist = t * scale
            if dist >= depth[py, px]:
                continue
            qx = ox + lx * t
            qy = oy + ly * t
            qz = oz + lz * t
            e = 0.0005
            gx = _sdf(qx + e, qy, qz, kinds, ops, ks, mats, A, B, Rr)[0] - _sdf(qx - e, qy, qz, kinds, ops, ks, mats, A, B, Rr)[0]
            gy = _sdf(qx, qy + e, qz, kinds, ops, ks, mats, A, B, Rr)[0] - _sdf(qx, qy - e, qz, kinds, ops, ks, mats, A, B, Rr)[0]
            gz = _sdf(qx, qy, qz + e, kinds, ops, ks, mats, A, B, Rr)[0] - _sdf(qx, qy, qz - e, kinds, ops, ks, mats, A, B, Rr)[0]
            gl = math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-12
            gx /= gl
            gy /= gl
            gz /= gl
            # occlusion: how much face is close above this point
            occ = 0.0
            for s in range(1, 5):
                hh = 0.004 * s
                dd = _sdf(qx + gx * hh, qy + gy * hh, qz + gz * hh, kinds, ops, ks, mats, A, B, Rr)[0]
                occ += (hh - dd) / (2.0 ** s)
            a_ = max(0.25, min(1.0, 1.0 - occ * 60.0))
            depth[py, px] = dist
            nrm[py, px, 0] = Rh[0, 0] * gx + Rh[0, 1] * gy + Rh[0, 2] * gz
            nrm[py, px, 1] = Rh[1, 0] * gx + Rh[1, 1] * gy + Rh[1, 2] * gz
            nrm[py, px, 2] = Rh[2, 0] * gx + Rh[2, 1] * gy + Rh[2, 2] * gz
            mat[py, px] = m
            oid[py, px] = oid0
            var[py, px] = eyes if m == 9 else 0.3
            att[py, px] = 0.0
            aux[py, px] = 0.0
            ao[py, px] = a_


def draw(g, cam, head, Rh, scale, expr, oid0=8300000):
    kinds, ops, ks, mats, A, B, R = build(expr)
    c = cam.to_cam(head[None])[0]
    if c[2] <= 0.5:
        return False
    rad = 0.21 * scale
    sx = cam.W / 2 + c[0] / c[2] * cam.focal
    sy = cam.H / 2 - c[1] / c[2] * cam.focal
    rs = rad * cam.focal / max(c[2] - rad, 0.5)
    bx0, bx1 = max(0, int(sx - rs)), min(cam.W - 1, int(sx + rs) + 1)
    by0, by1 = max(0, int(sy - rs)), min(cam.H - 1, int(sy + rs) + 1)
    if bx0 > bx1 or by0 > by1:
        return False
    trace(np.asarray(cam.eye, np.float64), np.ascontiguousarray(cam.R), float(cam.focal), np.ascontiguousarray(Rh),
          np.asarray(head, np.float64), float(scale), bx0, bx1, by0, by1, kinds, ops, ks, mats, A, B, R,
          float(expr['eyes']), g.depth, g.nrm, g.mat, g.oid, g.var, g.att, g.aux, g.ao, oid0)
    return True
