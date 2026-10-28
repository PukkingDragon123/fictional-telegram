"""The land: a valley 16 km across. Meadow in the middle with a lake, a belt of
forest rising to the north, foothills, and behind them a range of eroded
mountains with snow on the peaks; lower ridges close it in east, west and
south.

The heights are noise (ridged and domain-warped for the ranges), then worn
down by a few hundred thousand raindrops (hydraulic erosion), so the slopes
get the gullies, spurs and fans of real mountains. Kept as a 2048x2048 map
(7.8 m a texel) with its normals; the mesh drawn from it is a grid that is
fine (2-3 m) where the film happens and coarse far off.
"""
import math
import os

import cv2
import numpy as np
from numba import njit

from hd2d import pnoise

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
X0, X1, Z0, Z1 = -8000.0, 8000.0, -4000.0, 12000.0
N = 2048
CELL = (X1 - X0) / N
LAKE = (-650.0, 820.0, 430.0, 270.0)      # centre x, z, radii
WATER = -0.8                              # the lake's surface (and the flooded rice fields')
CENTRE = (60.0, 520.0)                    # where the mesh is finest
PADDY = (-140.0, 300.0, 420.0, 820.0)     # the rice fields: x0, x1, z0, z1
PLOT_W, PLOT_D = 27.0, 20.0               # each field between its dikes


def in_paddies(x, z, margin=0.0):
    x0, x1, z0, z1 = PADDY
    return (x > x0 - margin) & (x < x1 + margin) & (z > z0 - margin) & (z < z1 + margin)


def dike_x(i, z):
    return PADDY[0] + PLOT_W * i + 2.0 * np.sin(np.asarray(z) / 37.0 + i * 1.3)


def dike_z(j, x):
    return PADDY[2] + PLOT_D * j + 1.5 * np.sin(np.asarray(x) / 41.0 + j * 0.7)


def dike_dist(x, z):
    """Distance to the nearest dike."""
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    i = np.round((x - PADDY[0]) / PLOT_W)
    j = np.round((z - PADDY[2]) / PLOT_D)
    dx = np.min(np.stack([np.abs(x - dike_x(i + k, z)) for k in (-1, 0, 1)]), 0)
    dz = np.min(np.stack([np.abs(z - dike_z(j + k, x)) for k in (-1, 0, 1)]), 0)
    return np.minimum(dx, dz)


@njit(cache=True)
def _fbm_grid(X, Z, sc, octaves, seed):
    out = np.empty(X.shape, np.float32)
    for i in range(X.shape[0]):
        for j in range(X.shape[1]):
            x, y = X[i, j] / sc, Z[i, j] / sc
            a, s, tot = 1.0, 0.0, 0.0
            for o in range(octaves):
                s += a * pnoise(x, y, seed + o * 31)
                tot += a
                x = x * 2.03 + 17.3
                y = y * 2.03 - 9.1
                a *= 0.5
            out[i, j] = s / tot
    return out


@njit(cache=True)
def _ridged_grid(X, Z, sc, octaves, seed):
    """Ridged multifractal: sharp crests, each octave weighted by the last."""
    out = np.empty(X.shape, np.float32)
    for i in range(X.shape[0]):
        for j in range(X.shape[1]):
            x, y = X[i, j] / sc, Z[i, j] / sc
            a, s, tot, w = 1.0, 0.0, 0.0, 1.0
            for o in range(octaves):
                n = pnoise(x, y, seed + o * 57)
                r = 1.0 - min(1.0, abs(n) * 1.5)
                r = r * r
                s += r * a * w
                tot += a
                w = min(1.0, max(0.0, r * 1.6))
                x = x * 2.07 + 31.7
                y = y * 2.07 - 12.3
                a *= 0.52
            out[i, j] = s / tot
    return out


def smoothstep(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


@njit(cache=True)
def _erode(h, n_drops, seed, radius=3, inertia=0.05, cap_k=4.0, min_cap=0.01, dep=0.3, ero=0.3, evap=0.012,
           grav=4.0, life=40):
    np.random.seed(seed)
    n = h.shape[0]
    # the brush: weights of the cells within the radius
    offs = []
    wts = []
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            d = math.sqrt(dx * dx + dy * dy)
            if d <= radius:
                offs.append((dy, dx))
                wts.append(radius - d)
    sw = 0.0
    for w in wts:
        sw += w
    for k in range(n_drops):
        px = np.random.uniform(1, n - 2)
        py = np.random.uniform(1, n - 2)
        dx = 0.0
        dy = 0.0
        speed = 1.0
        water = 1.0
        sed = 0.0
        for step in range(life):
            ix = int(px)
            iy = int(py)
            fx = px - ix
            fy = py - iy
            h00 = h[iy, ix]
            h10 = h[iy, ix + 1]
            h01 = h[iy + 1, ix]
            h11 = h[iy + 1, ix + 1]
            gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy
            gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx
            hc = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
            dx = dx * inertia - gx * (1 - inertia)
            dy = dy * inertia - gy * (1 - inertia)
            ln = math.sqrt(dx * dx + dy * dy)
            if ln < 1e-9:
                break
            dx /= ln
            dy /= ln
            px += dx
            py += dy
            if px < 1 or px >= n - 2 or py < 1 or py >= n - 2:
                break
            jx = int(px)
            jy = int(py)
            gx2 = px - jx
            gy2 = py - jy
            hn = (h[jy, jx] * (1 - gx2) * (1 - gy2) + h[jy, jx + 1] * gx2 * (1 - gy2) + h[jy + 1, jx] * (1 - gx2) * gy2
                  + h[jy + 1, jx + 1] * gx2 * gy2)
            dh = hn - hc
            cap = max(-dh * speed * water * cap_k, min_cap)
            if sed > cap or dh > 0:
                amt = min(dh, sed) if dh > 0 else (sed - cap) * dep
                sed -= amt
                h[iy, ix] += amt * (1 - fx) * (1 - fy)
                h[iy, ix + 1] += amt * fx * (1 - fy)
                h[iy + 1, ix] += amt * (1 - fx) * fy
                h[iy + 1, ix + 1] += amt * fx * fy
            else:
                amt = min((cap - sed) * ero, -dh)
                for q in range(len(offs)):
                    oy, ox = offs[q]
                    yy = iy + oy
                    xx = ix + ox
                    if 0 <= yy < n and 0 <= xx < n:
                        e = amt * wts[q] / sw
                        d_ = min(h[yy, xx], e) if h[yy, xx] < e else e
                        h[yy, xx] -= d_
                        sed += d_
            speed = math.sqrt(max(0.0, speed * speed + dh * grav))
            water *= 1 - evap
    return h


def lake_e(x, z):
    cx, cz, rx, rz = LAKE
    return ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2


def build():
    """Make the height map (cached)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, 'terrain.npz')
    if os.path.exists(path):
        d = np.load(path)
        return d['h'], d['nrm']
    n = 1024
    xs = np.linspace(X0, X1, n, endpoint=False) + (X1 - X0) / n / 2
    zs = np.linspace(Z0, Z1, n, endpoint=False) + (Z1 - Z0) / n / 2
    X, Z = np.meshgrid(xs, zs)
    d = np.sqrt(((X - 0) / 2900) ** 2 + ((Z - 1100) / 2300) ** 2)
    d = d + 0.35 * _fbm_grid(X, Z, 2600.0, 4, 3)
    rise = smoothstep(0.82, 2.1, d)
    north = smoothstep(2500, 9500, Z)
    wx = X + 1300 * _fbm_grid(X + 500, Z, 4200.0, 4, 11)
    wz = Z + 1300 * _fbm_grid(X, Z - 700, 4200.0, 4, 17)
    R = _ridged_grid(wx, wz, 4600.0, 8, 5)
    amp = 260 + 2300 * north
    mount = rise ** 1.6 * amp * (0.18 + 1.05 * R)
    foot = 70 * smoothstep(1100, 3600, Z) * (1 - rise) + 25 * smoothstep(1500, 2600, np.abs(X))
    h = mount + foot + 9 * _fbm_grid(X, Z, 1500.0, 4, 23)
    # a light erosion: rain cuts channels down the slopes
    k = CELL * 2 * 25
    he = _erode((h / k).astype(np.float64), 60000, 7, 2, 0.3, 4.0, 0.01, 0.02, 0.3, 0.015)
    h = (he * k).astype(np.float32)
    # up to the full map, with fine rocky detail where it is steep
    h = cv2.resize(h, (N, N), interpolation=cv2.INTER_CUBIC)
    xs = np.linspace(X0, X1, N, endpoint=False) + CELL / 2
    zs = np.linspace(Z0, Z1, N, endpoint=False) + CELL / 2
    X, Z = np.meshgrid(xs, zs)
    gy, gx = np.gradient(h, CELL)
    slope = np.sqrt(gx * gx + gy * gy)
    rock = smoothstep(0.25, 0.8, slope)
    h = h + 14 * _ridged_grid(X, Z, 260.0, 4, 41) * rock * smoothstep(150, 600, h)
    # the meadow: gentle swells, and the lake
    meadow = 1.6 * _fbm_grid(X, Z, 180.0, 4, 51) + 3.5 * _fbm_grid(X, Z, 900.0, 3, 53)
    inval = 1 - smoothstep(0.75, 1.0, np.sqrt(((X - 0) / 2900) ** 2 + ((Z - 1100) / 2300) ** 2))
    h = h + meadow * inval
    e = lake_e(X, Z) * (1 + 0.12 * _fbm_grid(X, Z, 160.0, 3, 61))
    bowl = WATER - 0.4 - 7.0 * np.clip(1 - e, 0, 1) ** 0.6
    shore = smoothstep(1.0, 1.45, e)
    h = np.where(e < 1, bowl, np.maximum(h, 0) * shore + (WATER + 0.25) * (1 - shore))
    # the rice fields: levelled just under the water, banked up round the edge
    x0, x1, z0, z1 = PADDY
    ex = np.maximum(np.maximum(x0 - X, X - x1), 0)
    ez = np.maximum(np.maximum(z0 - Z, Z - z1), 0)
    edge = np.hypot(ex, ez)
    k = smoothstep(0, 40, edge)
    h = h * k + (WATER - 0.15) * (1 - k)
    h = h.astype(np.float32)
    nrm = normals(h)
    np.savez_compressed(path, h=h, nrm=nrm)
    return h, nrm


def normals(h):
    gy, gx = np.gradient(h.astype(np.float64), CELL)
    n = np.stack([-gx, np.ones_like(gx), -gy], -1)
    return (n / np.linalg.norm(n, axis=-1, keepdims=True)).astype(np.float32)


class Land:
    def __init__(self):
        self.h, self.nrm = build()

    def _uv(self, x, z):
        u = (np.asarray(x, np.float64) - X0) / CELL - 0.5
        v = (np.asarray(z, np.float64) - Z0) / CELL - 0.5
        return np.clip(u, 0, N - 1.001), np.clip(v, 0, N - 1.001)

    def _bil(self, A, x, z):
        u, v = self._uv(x, z)
        i, j = v.astype(np.int64), u.astype(np.int64)
        fu, fv = u - j, v - i
        if A.ndim == 3:
            fu, fv = fu[..., None], fv[..., None]
        return (A[i, j] * (1 - fu) * (1 - fv) + A[i, j + 1] * fu * (1 - fv) + A[i + 1, j] * (1 - fu) * fv +
                A[i + 1, j + 1] * fu * fv)

    def height(self, x, z):
        return self._bil(self.h, x, z)

    def normal(self, x, z):
        n = self._bil(self.nrm, x, z)
        return n / np.linalg.norm(n, axis=-1, keepdims=True)

    def mesh(self, n=900):
        """A grid that is a few metres fine round the film and coarse far off."""
        path = os.path.join(CACHE, 'mesh%d.npz' % n)
        if os.path.exists(path):
            d = np.load(path)
            return d['v'], d['f'], d['vn']
        u = np.linspace(-1, 1, n)
        k = 3.6

        def warp(c, lo, hi):
            s = np.sinh(k * u) / math.sinh(k)
            return np.where(u < 0, c + (c - lo) * s, c + (hi - c) * s)
        xs = warp(CENTRE[0], X0 + CELL, X1 - CELL)
        zs = warp(CENTRE[1], Z0 + CELL, Z1 - CELL)
        X, Z = np.meshgrid(xs, zs)
        Y = self.height(X, Z)
        v = np.stack([X, Y, Z], -1).reshape(-1, 3)
        vn = self.normal(X, Z).reshape(-1, 3)
        i = np.arange(n * n).reshape(n, n)
        a, b, c, d = i[:-1, :-1].ravel(), i[:-1, 1:].ravel(), i[1:, :-1].ravel(), i[1:, 1:].ravel()
        f = np.concatenate([np.stack([a, b, d], 1), np.stack([a, d, c], 1)]).astype(np.int32)
        np.savez(path, v=v, f=f, vn=vn.astype(np.float32))
        return v, f, vn
