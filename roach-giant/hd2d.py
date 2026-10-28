"""HD-2D: a small deferred renderer that draws a real 3D world as pixel art.

Everything is drawn at 640x360 into a g-buffer - distance along the ray,
normal, material, object id, a per-object variation and one interpolated
attribute - by three kinds of primitive:

  triangles   the land and the water (a rasterizer, perspective-correct)
  capsules    trunks, branches, twigs, grass blades, stems, the giant's limbs
              (ray-cast, so they are exact; thin ones are kept a pixel wide)
  ellipsoids  leaf clumps (with a ragged, leafy pixel edge and holes when they
              die), flower heads, the giant's skull and ribcage

Then it is lit the way a pixel artist would light it: the light is cut into a
few bands with ordered dithering where one band meets the next, each band a
colour of the material's own ramp, and every edge where something stands in
front of something else gets a dark line. Shadows come from a shadow map
rendered with the same primitives from the moon.

Rays are worked out per pixel from the camera, so the same kernels draw the
shadow maps (a camera far away up the moon's direction, almost orthographic).
"""
import math

import numpy as np
from numba import njit

W, H = 640, 360
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0


# ---------------------------------------------------------------- hashing and noise
@njit(cache=True, inline='always')
def hash3(x, y, s):
    h = (x * 374761393 + y * 668265263 + s * 1442695041 + 0x9E3779B9) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return h / 4294967296.0


@njit(cache=True, inline='always')
def vnoise(x, y, s):
    xi = math.floor(x)
    yi = math.floor(y)
    fx = x - xi
    fy = y - yi
    ux = fx * fx * (3 - 2 * fx)
    uy = fy * fy * (3 - 2 * fy)
    ix = int(xi)
    iy = int(yi)
    a = hash3(ix, iy, s)
    b = hash3(ix + 1, iy, s)
    c = hash3(ix, iy + 1, s)
    d = hash3(ix + 1, iy + 1, s)
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy


@njit(cache=True, inline='always')
def _grad(ix, iy, s, x, y):
    a = hash3(ix, iy, s) * 6.283185307
    return math.cos(a) * x + math.sin(a) * y


@njit(cache=True, inline='always')
def pnoise(x, y, s):
    """Gradient (Perlin) noise, about -0.7..0.7."""
    xi = math.floor(x)
    yi = math.floor(y)
    fx = x - xi
    fy = y - yi
    ix = int(xi)
    iy = int(yi)
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    a = _grad(ix, iy, s, fx, fy)
    b = _grad(ix + 1, iy, s, fx - 1, fy)
    c = _grad(ix, iy + 1, s, fx, fy - 1)
    d = _grad(ix + 1, iy + 1, s, fx - 1, fy - 1)
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy


@njit(cache=True)
def fbm(X, Y, octaves, seed, lac=2.03, gain=0.5):
    """Value-noise fBm at many points (flat arrays); about -0.5..0.5."""
    out = np.empty(X.shape[0], np.float32)
    for i in range(X.shape[0]):
        x, y = X[i], Y[i]
        a, s, tot = 1.0, 0.0, 0.0
        for o in range(octaves):
            s += a * (vnoise(x, y, seed + o * 31) - 0.5)
            tot += a
            x = x * lac + 17.3
            y = y * lac - 9.1
            a *= gain
        out[i] = s / tot
    return out


@njit(cache=True)
def fbm_lod(X, Y, foot, octaves, seed):
    """fBm that leaves out the octaves finer than each point's pixel footprint
    (so far-off texture does not shimmer)."""
    out = np.empty(X.shape[0], np.float32)
    for i in range(X.shape[0]):
        x, y = X[i], Y[i]
        a, s, tot, f = 1.0, 0.0, 0.0, 1.0
        for o in range(octaves):
            k = 1.0 - min(1.0, max(0.0, (foot[i] * f - 0.35) / 0.4))
            if k <= 0:
                break
            s += a * k * (vnoise(x * f, y * f, seed + o * 31) - 0.5)
            tot += a
            f *= 2.03
            a *= 0.5
        out[i] = s / max(tot, 1e-6)
    return out


# ---------------------------------------------------------------- rays
@njit(cache=True, inline='always')
def _dir(px, py, R, focal, Wd, Hd):
    xc = (px + 0.5 - Wd * 0.5) / focal
    yc = -(py + 0.5 - Hd * 0.5) / focal
    dx = xc * R[0, 0] + yc * R[1, 0] + R[2, 0]
    dy = xc * R[0, 1] + yc * R[1, 1] + R[2, 1]
    dz = xc * R[0, 2] + yc * R[1, 2] + R[2, 2]
    n = math.sqrt(dx * dx + dy * dy + dz * dz)
    return dx / n, dy / n, dz / n, n


def rays(cam):
    """Unit ray per pixel (H, W, 3) and the length of the unnormalized one
    (distance along the ray = view depth x that)."""
    ys, xs = np.mgrid[0:cam.H, 0:cam.W].astype(np.float64)
    xc = (xs + 0.5 - cam.W / 2) / cam.focal
    yc = -(ys + 0.5 - cam.H / 2) / cam.focal
    d = xc[..., None] * cam.R[0] + yc[..., None] * cam.R[1] + cam.R[2]
    n = np.linalg.norm(d, axis=-1)
    return d / n[..., None], n


class GBuf:
    def __init__(self, w=W, h=H):
        self.depth = np.full((h, w), 1e30, np.float32)
        self.nrm = np.zeros((h, w, 3), np.float32)
        self.mat = np.zeros((h, w), np.int16)
        self.oid = np.zeros((h, w), np.int32)
        self.var = np.zeros((h, w), np.float32)
        self.att = np.zeros((h, w), np.float32)
        self.aux = np.zeros((h, w), np.float32)
        self.uv = np.zeros((h, w, 2), np.float32)

    def bufs(self):
        return self.depth, self.nrm, self.mat, self.oid, self.var, self.att, self.aux

    def copy(self):
        g = GBuf.__new__(GBuf)
        for k in ('depth', 'nrm', 'mat', 'oid', 'var', 'att', 'aux', 'uv'):
            setattr(g, k, getattr(self, k).copy())
        return g


def cam_args(cam):
    return np.asarray(cam.eye, np.float64), np.ascontiguousarray(cam.R, np.float64), float(cam.focal)


# ---------------------------------------------------------------- triangles
@njit(cache=True, fastmath=True, inline='always')
def _tri1(focal, X, Y, Z, N, V, t, fmat, foid, fvar, faux, depth, nrm, mat, oid, var, att, aux):
    """One triangle, camera-space corners X, Y, Z (all in front of the camera)."""
    Hd, Wd = depth.shape
    x0 = Wd * 0.5 + X[0] / Z[0] * focal
    y0 = Hd * 0.5 - Y[0] / Z[0] * focal
    x1 = Wd * 0.5 + X[1] / Z[1] * focal
    y1 = Hd * 0.5 - Y[1] / Z[1] * focal
    x2 = Wd * 0.5 + X[2] / Z[2] * focal
    y2 = Hd * 0.5 - Y[2] / Z[2] * focal
    minx = max(int(min(x0, x1, x2)), 0)
    maxx = min(int(max(x0, x1, x2)) + 1, Wd - 1)
    if minx > maxx:
        return
    miny = max(int(min(y0, y1, y2)), 0)
    maxy = min(int(max(y0, y1, y2)) + 1, Hd - 1)
    if miny > maxy:
        return
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if abs(area) < 1e-12:
        return
    iza, izb, izc = 1.0 / Z[0], 1.0 / Z[1], 1.0 / Z[2]
    for py in range(miny, maxy + 1):
        fy = py + 0.5
        yc = -(fy - Hd * 0.5) / focal
        for px in range(minx, maxx + 1):
            fx = px + 0.5
            w0 = ((x1 - fx) * (y2 - fy) - (x2 - fx) * (y1 - fy)) / area
            if w0 < 0:
                continue
            w1 = ((x2 - fx) * (y0 - fy) - (x0 - fx) * (y2 - fy)) / area
            if w1 < 0:
                continue
            w2 = 1.0 - w0 - w1
            if w2 < 0:
                continue
            z = 1.0 / (w0 * iza + w1 * izb + w2 * izc)
            xc = (fx - Wd * 0.5) / focal
            d = z * math.sqrt(xc * xc + yc * yc + 1.0)
            if d < depth[py, px]:
                depth[py, px] = d
                p0, p1, p2 = w0 * iza * z, w1 * izb * z, w2 * izc * z
                for k in range(3):
                    nrm[py, px, k] = p0 * N[0, k] + p1 * N[1, k] + p2 * N[2, k]
                att[py, px] = p0 * V[0] + p1 * V[1] + p2 * V[2]
                mat[py, px] = fmat[t]
                oid[py, px] = foid[t]
                var[py, px] = fvar[t]
                aux[py, px] = faux[t]


@njit(cache=True, fastmath=True)
def _tris(focal, cx, cy, cz, faces, vn, va, fmat, foid, fvar, faux, depth, nrm, mat, oid, var, att, aux, near):
    Hd, Wd = depth.shape
    X = np.empty(4)
    Y = np.empty(4)
    Z = np.empty(4)
    N = np.empty((4, 3))
    V = np.empty(4)
    X3 = np.empty(3)
    Y3 = np.empty(3)
    Z3 = np.empty(3)
    N3 = np.empty((3, 3))
    V3 = np.empty(3)
    for t in range(faces.shape[0]):
        a, b, c = faces[t, 0], faces[t, 1], faces[t, 2]
        za, zb, zc = cz[a], cz[b], cz[c]
        if za < near and zb < near and zc < near:
            continue
        if za >= near and zb >= near and zc >= near:
            # quick reject off screen
            xa, xb, xc_ = cx[a] / za, cx[b] / zb, cx[c] / zc
            lim = Wd * 0.5 / focal
            if (xa < -lim and xb < -lim and xc_ < -lim) or (xa > lim and xb > lim and xc_ > lim):
                continue
            ya, yb, yc_ = cy[a] / za, cy[b] / zb, cy[c] / zc
            lim = Hd * 0.5 / focal
            if (ya < -lim and yb < -lim and yc_ < -lim) or (ya > lim and yb > lim and yc_ > lim):
                continue
            for k, vi in enumerate((a, b, c)):
                X3[k], Y3[k], Z3[k], V3[k] = cx[vi], cy[vi], cz[vi], va[vi]
                N3[k, 0], N3[k, 1], N3[k, 2] = vn[vi, 0], vn[vi, 1], vn[vi, 2]
            _tri1(focal, X3, Y3, Z3, N3, V3, t, fmat, foid, fvar, faux, depth, nrm, mat, oid, var, att, aux)
            continue
        # clip against the near plane: a polygon of 3 or 4 corners
        m = 0
        idx = (a, b, c)
        for k in range(3):
            i0 = idx[k]
            i1 = idx[(k + 1) % 3]
            z0, z1 = cz[i0], cz[i1]
            if z0 >= near:
                X[m], Y[m], Z[m], V[m] = cx[i0], cy[i0], z0, va[i0]
                N[m, 0], N[m, 1], N[m, 2] = vn[i0, 0], vn[i0, 1], vn[i0, 2]
                m += 1
            if (z0 >= near) != (z1 >= near):
                s = (near - z0) / (z1 - z0)
                X[m] = cx[i0] + (cx[i1] - cx[i0]) * s
                Y[m] = cy[i0] + (cy[i1] - cy[i0]) * s
                Z[m] = near
                V[m] = va[i0] + (va[i1] - va[i0]) * s
                for q in range(3):
                    N[m, q] = vn[i0, q] + (vn[i1, q] - vn[i0, q]) * s
                m += 1
        for k in range(1, m - 1):
            for q, vi in enumerate((0, k, k + 1)):
                X3[q], Y3[q], Z3[q], V3[q] = X[vi], Y[vi], Z[vi], V[vi]
                N3[q, 0], N3[q, 1], N3[q, 2] = N[vi, 0], N[vi, 1], N[vi, 2]
            _tri1(focal, X3, Y3, Z3, N3, V3, t, fmat, foid, fvar, faux, depth, nrm, mat, oid, var, att, aux)


def draw_tris(g, cam, v, f, vn, va, fmat, foid, fvar, faux=None, near=0.2):
    c = cam.to_cam(v)
    faux = np.zeros(len(f), np.float32) if faux is None else faux
    _tris(float(cam.focal), np.ascontiguousarray(c[:, 0]), np.ascontiguousarray(c[:, 1]),
          np.ascontiguousarray(c[:, 2]), f, vn, va, fmat, foid, fvar, faux, *g.bufs(), near)


# ---------------------------------------------------------------- capsules
@njit(cache=True, fastmath=True)
def _capsules(eye, R, focal, A, B, rad, bbox, pmat, poid, pvar, paux, a0, a1, depth, nrm, mat, oid, var, att, aux):
    Hd, Wd = depth.shape
    ox, oy, oz = eye[0], eye[1], eye[2]
    for i in range(A.shape[0]):
        bx0, bx1, by0, by1 = bbox[i, 0], bbox[i, 1], bbox[i, 2], bbox[i, 3]
        if bx0 > bx1 or by0 > by1:
            continue
        pax, pay, paz = A[i, 0], A[i, 1], A[i, 2]
        bax, bay, baz = B[i, 0] - pax, B[i, 1] - pay, B[i, 2] - paz
        r = rad[i]
        baba = bax * bax + bay * bay + baz * baz
        if baba < 1e-12:
            baba = 1e-12
        oax, oay, oaz = ox - pax, oy - pay, oz - paz
        baoa = bax * oax + bay * oay + baz * oaz
        oaoa = oax * oax + oay * oay + oaz * oaz
        obx, oby, obz = ox - B[i, 0], oy - B[i, 1], oz - B[i, 2]
        for py in range(by0, by1 + 1):
            for px in range(bx0, bx1 + 1):
                dx, dy, dz, _ = _dir(px, py, R, focal, Wd, Hd)
                bard = bax * dx + bay * dy + baz * dz
                rdoa = dx * oax + dy * oay + dz * oaz
                a = baba - bard * bard
                b = baba * rdoa - baoa * bard
                c = baba * oaoa - baoa * baoa - r * r * baba
                h = b * b - a * c
                if h < 0:
                    continue
                t = -1.0
                y = 0.0
                if a > 1e-12:
                    t = (-b - math.sqrt(h)) / a
                    y = baoa + t * bard
                if not (a > 1e-12 and 0 < y < baba):
                    if y <= 0:
                        cx, cy, cz = oax, oay, oaz
                    else:
                        cx, cy, cz = obx, oby, obz
                    b2 = dx * cx + dy * cy + dz * cz
                    c2 = cx * cx + cy * cy + cz * cz - r * r
                    h2 = b2 * b2 - c2
                    if h2 <= 0:
                        continue
                    t = -b2 - math.sqrt(h2)
                if t <= 0 or t >= depth[py, px]:
                    continue
                qx, qy, qz = oax + t * dx, oay + t * dy, oaz + t * dz
                hh = min(1.0, max(0.0, (qx * bax + qy * bay + qz * baz) / baba))
                nx, ny, nz = qx - hh * bax, qy - hh * bay, qz - hh * baz
                nl = math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-12
                depth[py, px] = t
                nrm[py, px, 0] = nx / nl
                nrm[py, px, 1] = ny / nl
                nrm[py, px, 2] = nz / nl
                mat[py, px] = pmat[i]
                oid[py, px] = poid[i]
                var[py, px] = pvar[i]
                aux[py, px] = paux[i]
                att[py, px] = a0[i] + (a1[i] - a0[i]) * hh


def _bbox(cam, C, rb, pad=1.0):
    """Screen boxes round spheres (centres C, radii rb); empty if behind."""
    c = cam.to_cam(C)
    z = c[:, 2]
    zs = np.maximum(z, 1e-3)
    sx = cam.W / 2 + c[:, 0] / zs * cam.focal
    sy = cam.H / 2 - c[:, 1] / zs * cam.focal
    near = z < rb * 1.05
    rs = rb * cam.focal / np.sqrt(np.maximum(z * z - rb * rb, 1e-6)) * 1.08 + pad
    bb = np.stack([np.floor(sx - rs), np.ceil(sx + rs), np.floor(sy - rs), np.ceil(sy + rs)], 1)
    bb = np.where(near[:, None], np.array([0, cam.W - 1, 0, cam.H - 1]), bb)
    bb[:, 0] = np.maximum(bb[:, 0], 0)
    bb[:, 1] = np.minimum(bb[:, 1], cam.W - 1)
    bb[:, 2] = np.maximum(bb[:, 2], 0)
    bb[:, 3] = np.minimum(bb[:, 3], cam.H - 1)
    bb[z + rb <= 0.3] = (1, 0, 1, 0)
    return bb.astype(np.int32), sx, sy, z


def min_radius(cam, P, r, px=0.6):
    """Keep thin things at least about a pixel wide."""
    d = np.linalg.norm(P - cam.eye, axis=-1)
    return np.maximum(r, px * 0.5 * d / cam.focal)


def draw_capsules(g, cam, A, B, r, mat, oid, var, a0=None, a1=None, widen=True, aux=0.0):
    n = len(A)
    if not n:
        return
    A = np.asarray(A, np.float64)
    B = np.asarray(B, np.float64)
    r = np.asarray(r, np.float64)
    if widen:
        r = min_radius(cam, (A + B) / 2, r)
    C = (A + B) / 2
    rb = np.linalg.norm(B - A, axis=1) / 2 + r
    bb, _, _, _ = _bbox(cam, C, rb)
    keep = (bb[:, 0] <= bb[:, 1]) & (bb[:, 2] <= bb[:, 3])
    if not keep.any():
        return
    f = lambda x, dt: np.ascontiguousarray(np.broadcast_to(np.asarray(x, dt), (n,))[keep])
    a0 = np.zeros(n) if a0 is None else a0
    a1 = a0 if a1 is None else a1
    _capsules(*cam_args(cam), np.ascontiguousarray(A[keep]), np.ascontiguousarray(B[keep]), r[keep], bb[keep],
              f(mat, np.int16), f(oid, np.int32), f(var, np.float32), f(aux, np.float32), f(a0, np.float32),
              f(a1, np.float32), *g.bufs())


# ---------------------------------------------------------------- ellipsoids
@njit(cache=True, fastmath=True)
def _ellipsoids(eye, R, focal, C, M, bbox, pmat, poid, pvar, paux, leaf, ssx, ssy, srs, depth, nrm, mat, oid, var,
                att, aux, uv):
    Hd, Wd = depth.shape
    for i in range(C.shape[0]):
        bx0, bx1, by0, by1 = bbox[i, 0], bbox[i, 1], bbox[i, 2], bbox[i, 3]
        if bx0 > bx1 or by0 > by1:
            continue
        rx, ry, rz = eye[0] - C[i, 0], eye[1] - C[i, 1], eye[2] - C[i, 2]
        olx = M[i, 0, 0] * rx + M[i, 0, 1] * ry + M[i, 0, 2] * rz
        oly = M[i, 1, 0] * rx + M[i, 1, 1] * ry + M[i, 1, 2] * rz
        olz = M[i, 2, 0] * rx + M[i, 2, 1] * ry + M[i, 2, 2] * rz
        cc = olx * olx + oly * oly + olz * olz - 1.0
        lf = leaf[i]
        cs = max(1, min(5, int(srs[i] / 9.0)))
        ix0 = int(math.floor(ssx[i]))
        iy0 = int(math.floor(ssy[i]))
        for py in range(by0, by1 + 1):
            for px in range(bx0, bx1 + 1):
                dx, dy, dz, _ = _dir(px, py, R, focal, Wd, Hd)
                dlx = M[i, 0, 0] * dx + M[i, 0, 1] * dy + M[i, 0, 2] * dz
                dly = M[i, 1, 0] * dx + M[i, 1, 1] * dy + M[i, 1, 2] * dz
                dlz = M[i, 2, 0] * dx + M[i, 2, 1] * dy + M[i, 2, 2] * dz
                a = dlx * dlx + dly * dly + dlz * dlz
                b = olx * dlx + oly * dly + olz * dlz
                h = b * b - a * cc
                if h < 0:
                    continue
                t = (-b - math.sqrt(h)) / a
                if t <= 0 or t >= depth[py, px]:
                    continue
                at = 0.0
                if lf >= 0:
                    # leaves: cells of a few pixels pinned to the clump's place on screen
                    qx = (px - ix0) // cs
                    qy = (py - iy0) // cs
                    hc = hash3(qx, qy, poid[i] * 7 + 3)
                    ex = (px + 0.5 - ssx[i]) / srs[i]
                    ey = (py + 0.5 - ssy[i]) / srs[i]
                    rr = math.sqrt(ex * ex + ey * ey)
                    if rr > 1.0 - 0.42 * hc * hc:
                        continue
                    if lf > 0 and hash3(qx, qy, poid[i] * 13 + 5) < lf:
                        continue
                    at = hc
                px_ = olx + t * dlx
                py_ = oly + t * dly
                pz_ = olz + t * dlz
                nx = M[i, 0, 0] * px_ + M[i, 1, 0] * py_ + M[i, 2, 0] * pz_
                ny = M[i, 0, 1] * px_ + M[i, 1, 1] * py_ + M[i, 2, 1] * pz_
                nz = M[i, 0, 2] * px_ + M[i, 1, 2] * py_ + M[i, 2, 2] * pz_
                nl = math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-12
                depth[py, px] = t
                nrm[py, px, 0] = nx / nl
                nrm[py, px, 1] = ny / nl
                nrm[py, px, 2] = nz / nl
                mat[py, px] = pmat[i]
                oid[py, px] = poid[i]
                var[py, px] = pvar[i]
                aux[py, px] = paux[i]
                att[py, px] = at
                uv[py, px, 0] = px_
                uv[py, px, 1] = pz_


def ell_matrix(radii, Rm=None):
    """M maps world offsets to the unit sphere: M = diag(1/r) @ Rm^T (Rm's
    columns are the ellipsoid's axes)."""
    radii = np.asarray(radii, np.float64)
    n = len(radii)
    M = np.zeros((n, 3, 3))
    if Rm is None:
        M[:, 0, 0], M[:, 1, 1], M[:, 2, 2] = 1 / radii[:, 0], 1 / radii[:, 1], 1 / radii[:, 2]
        return M
    return np.einsum('ni,nji->nij', 1 / radii, Rm)


def draw_ellipsoids(g, cam, C, radii, mat, oid, var, leaf=None, Rm=None, widen=True, aux=0.0):
    n = len(C)
    if not n:
        return
    C = np.asarray(C, np.float64)
    radii = np.asarray(radii, np.float64)
    if widen:
        rmin = min_radius(cam, C, np.zeros(n), 1.0)
        radii = np.maximum(radii, rmin[:, None])
    rb = radii.max(1)
    bb, sx, sy, z = _bbox(cam, C, rb)
    keep = (bb[:, 0] <= bb[:, 1]) & (bb[:, 2] <= bb[:, 3])
    if not keep.any():
        return
    M = ell_matrix(radii, Rm)
    f = lambda x, dt: np.ascontiguousarray(np.broadcast_to(np.asarray(x, dt), (n,))[keep])
    rs = rb * cam.focal / np.maximum(z, 1e-3)
    _ellipsoids(*cam_args(cam), np.ascontiguousarray(C[keep]), np.ascontiguousarray(M[keep]), bb[keep],
                f(mat, np.int16), f(oid, np.int32), f(var, np.float32), f(aux, np.float32),
                f(-1.0 if leaf is None else leaf, np.float32), f(sx, np.float64), f(sy, np.float64),
                f(rs, np.float64), *g.bufs(), g.uv)


# ---------------------------------------------------------------- shadow maps
class ShadowMap:
    """A depth map seen from the moon: a camera far up its direction with a
    narrow lens (as good as orthographic), covering a square round `centre`."""

    def __init__(self, centre, light_dir, half, size=2048, far=60000.0):
        from raster3d import Camera
        self.centre = np.asarray(centre, np.float64)
        ld = np.asarray(light_dir, np.float64)
        ld = ld / np.linalg.norm(ld)
        eye = self.centre + ld * far
        fov = math.degrees(2 * math.atan(half / far))
        up = (0, 0, 1) if abs(ld[1]) > 0.95 else (0, 1, 0)
        self.cam = Camera(eye, self.centre, fov, size, size, up=up)
        self.g = GBuf(size, size)
        self.texel = 2 * half / size

    def recentre(self, centre, light_dir, half, far=60000.0):
        from raster3d import Camera
        self.centre = np.asarray(centre, np.float64)
        ld = np.asarray(light_dir, np.float64)
        ld = ld / np.linalg.norm(ld)
        fov = math.degrees(2 * math.atan(half / far))
        up = (0, 0, 1) if abs(ld[1]) > 0.95 else (0, 1, 0)
        self.cam = Camera(self.centre + ld * far, self.centre, fov, self.cam.W, self.cam.H, up=up)
        self.texel = 2 * half / self.cam.W
        self.g.depth.fill(1e30)

    def lookup(self, P, bias=None):
        """1 where world points P (..., 3) see the moon, 0 in shadow."""
        sh = P.shape[:-1]
        P = P.reshape(-1, 3)
        x, y, z = self.cam.project(P)
        d = np.linalg.norm(P - self.cam.eye, axis=1)
        xi = np.clip(x.astype(np.int64), 0, self.cam.W - 1)
        yi = np.clip(y.astype(np.int64), 0, self.cam.H - 1)
        inside = (x >= 0) & (x < self.cam.W) & (y >= 0) & (y < self.cam.H)
        b = self.texel * 1.5 if bias is None else bias
        lit = (d <= self.g.depth[yi, xi] + b) | ~inside
        return lit.reshape(sh).astype(np.float32)


# ---------------------------------------------------------------- pixel-art finishing
def band(I, n, dither=0.5, ox=0, oy=0):
    """Cut light I (0..1) into n bands, ordered dither where they meet."""
    h, w = I.shape
    b = np.tile(BAYER, (h // 4 + 2, w // 4 + 2))[oy % 4:oy % 4 + h, ox % 4:ox % 4 + w]
    return np.clip(np.floor(I * (n - 1) + 0.5 + (b - 0.5) * dither), 0, n - 1).astype(np.int32)


def edges(depth, oid, rel=0.035, absol=0.25):
    """Pixels on the near side of a depth break (outline) - and which way."""
    d = depth
    out = np.zeros(d.shape, bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        n = np.roll(np.roll(d, dy, 0), dx, 1)
        o = np.roll(np.roll(oid, dy, 0), dx, 1)
        out |= (n - d > d * rel + absol) & (o != oid)
    out[0, :] = out[-1, :] = False
    out[:, 0] = out[:, -1] = False
    return out
