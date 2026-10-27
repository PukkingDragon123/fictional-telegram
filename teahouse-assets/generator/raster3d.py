"""A small software renderer for low-poly 3D: flat-shaded triangles, a z-buffer,
and an id buffer (which object each pixel belongs to), so 2D styling - outlines,
glows, textures - can be drawn on top. Used for the goat-dragon's flying sprites
and the void cinematic.

    m = Mesh(); m.add(verts, faces, colour, oid)
    cam = Camera(eye, target, fov, W, H)
    rgb, depth, ids = render(cam, [m, ...], light=(...))
"""
import math
import numpy as np
from numba import njit


# ---------------------------------------------------------------- meshes
class Mesh:
    """Triangles with a colour and an object id per face."""

    def __init__(self):
        self.v, self.f, self.c, self.o = [], [], [], []
        self.n = 0

    def add(self, verts, faces, colour, oid=1):
        verts = np.asarray(verts, np.float32)
        faces = np.asarray(faces, np.int32)
        self.v.append(verts)
        self.f.append(faces + self.n)
        col = np.asarray(colour, np.float32)
        self.c.append(np.broadcast_to(col, (len(faces), 3)) if col.ndim == 1 else col)
        self.o.append(np.full(len(faces), oid, np.int32))
        self.n += len(verts)
        return self

    def arrays(self):
        if not self.v:
            return (np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32), np.zeros((0, 3), np.float32),
                    np.zeros(0, np.int32))
        return np.concatenate(self.v), np.concatenate(self.f), np.concatenate(self.c), np.concatenate(self.o)


def tube(path, radii, sides=7, jitter=0.0, rng=None, cap=True):
    """A low-poly tube along a 3D polyline (path (N,3), radii (N,)): rings of
    `sides` vertices, optionally roughed up a little so it looks hand-modelled."""
    path = np.asarray(path, np.float64)
    radii = np.broadcast_to(np.asarray(radii, np.float64), (len(path),))
    n = len(path)
    t = np.gradient(path, axis=0)
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    ref = np.array([0.0, 0.0, 1.0]) if abs(t[0, 1]) > 0.9 else np.array([0.0, 1.0, 0.0])
    verts = []
    u = np.cross(t[0], ref)
    u /= np.linalg.norm(u)
    for i in range(n):                                      # parallel transport the ring frame
        u = u - t[i] * np.dot(u, t[i])
        u /= max(np.linalg.norm(u), 1e-9)
        w = np.cross(t[i], u)
        for k in range(sides):
            a = 2 * math.pi * k / sides
            r = radii[i] * (1 + (rng.uniform(-jitter, jitter) if rng is not None and jitter else 0))
            verts.append(path[i] + (u * math.cos(a) + w * math.sin(a)) * r)
    faces = []
    for i in range(n - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            c, d = a + sides, b + sides
            faces += [(a, c, b), (b, c, d)]
    if cap:
        verts.append(path[0])
        verts.append(path[-1])
        s0, s1 = len(verts) - 2, len(verts) - 1
        for k in range(sides):
            faces.append((s0, (k + 1) % sides, k))
            faces.append((s1, (n - 1) * sides + k, (n - 1) * sides + (k + 1) % sides))
    return np.array(verts, np.float32), np.array(faces, np.int32)


_ICO = {}


def icosphere(sub=1):
    if sub not in _ICO:
        _ICO[sub] = _icosphere(sub)
    v, f = _ICO[sub]
    return v.copy(), f.copy()


def _icosphere(sub):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
         (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
         (8, 6, 7), (9, 8, 1)]
    v = [np.array(p, float) / np.linalg.norm(p) for p in v]
    for _ in range(sub):
        mid = {}
        nf = []

        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in mid:
                p = v[a] + v[b]
                v.append(p / np.linalg.norm(p))
                mid[k] = len(v) - 1
            return mid[k]
        for a, b, c in f:
            ab, bc, ca = m(a, b), m(b, c), m(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return np.array(v, np.float32), np.array(f, np.int32)


def blob(centre, radii, sub=1, rng=None, jitter=0.0):
    """A low-poly ellipsoid (an icosphere squashed and roughed up)."""
    v, f = icosphere(sub)
    if rng is not None and jitter:
        v = v * (1 + rng.uniform(-jitter, jitter, (len(v), 1))).astype(np.float32)
    return (v * np.asarray(radii, np.float32) + np.asarray(centre, np.float32)), f


def rot(axis, ang):
    axis = np.asarray(axis, float)
    axis /= np.linalg.norm(axis)
    x, y, z = axis
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


# ---------------------------------------------------------------- camera
class Camera:
    def __init__(self, eye, target, fov, W, H, up=(0, 1, 0), near=0.1):
        self.eye = np.asarray(eye, np.float64)
        self.W, self.H, self.near = W, H, near
        f = np.asarray(target, np.float64) - self.eye
        f /= np.linalg.norm(f)
        r = np.cross(f, up)
        r /= np.linalg.norm(r)
        u = np.cross(r, f)
        self.R = np.stack([r, u, f])                       # world -> camera axes
        self.focal = (H / 2) / math.tan(math.radians(fov) / 2)

    def to_cam(self, p):
        return (np.asarray(p, np.float64) - self.eye) @ self.R.T

    def project(self, p):
        """World points -> screen x, y (pixels) and depth (distance along the view)."""
        c = self.to_cam(p)
        z = np.maximum(c[..., 2], 1e-6)
        x = self.W / 2 + c[..., 0] / z * self.focal
        y = self.H / 2 - c[..., 1] / z * self.focal
        return x, y, c[..., 2]


# ---------------------------------------------------------------- rasterizing
@njit(cache=True)
def _raster(sx, sy, sz, faces, cols, oids, W, H, rgb, depth, ids):
    for t in range(faces.shape[0]):
        a, b, c = faces[t, 0], faces[t, 1], faces[t, 2]
        za, zb, zc = sz[a], sz[b], sz[c]
        if za <= 0.05 or zb <= 0.05 or zc <= 0.05:
            continue
        x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        minx = max(int(min(x0, x1, x2)), 0)
        maxx = min(int(max(x0, x1, x2)) + 1, W - 1)
        miny = max(int(min(y0, y1, y2)), 0)
        maxy = min(int(max(y0, y1, y2)) + 1, H - 1)
        if minx > maxx or miny > maxy:
            continue
        iza, izb, izc = 1.0 / za, 1.0 / zb, 1.0 / zc
        for py in range(miny, maxy + 1):
            fy = py + 0.5
            for px in range(minx, maxx + 1):
                fx = px + 0.5
                w0 = ((x1 - fx) * (y2 - fy) - (x2 - fx) * (y1 - fy)) / area
                w1 = ((x2 - fx) * (y0 - fy) - (x0 - fx) * (y2 - fy)) / area
                w2 = 1.0 - w0 - w1
                if w0 < 0 or w1 < 0 or w2 < 0:
                    continue
                z = 1.0 / (w0 * iza + w1 * izb + w2 * izc)
                if z < depth[py, px]:
                    depth[py, px] = z
                    rgb[py, px, 0] = cols[t, 0]
                    rgb[py, px, 1] = cols[t, 1]
                    rgb[py, px, 2] = cols[t, 2]
                    ids[py, px] = oids[t]


def shade(verts, faces, cols, light=(-0.4, 0.8, -0.45), ambient=0.42, sky=None, ground=None, cam_eye=None):
    """Flat shading per face: a key light, a soft fill from the sky above and a
    darker bounce from below - the soft, painted light of low-poly art."""
    p = verts[faces]
    n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    if cam_eye is not None:                                 # two-sided: face the camera
        view = cam_eye - p.mean(1)
        flip = (n * view).sum(1) < 0
        n[flip] *= -1
    L = np.asarray(light, np.float64)
    L /= np.linalg.norm(L)
    key = np.clip(n @ L, 0, 1)
    up = n[:, 1] * 0.5 + 0.5
    lit = ambient + (1 - ambient) * key
    out = cols * lit[:, None]
    if sky is not None:
        out = out + np.asarray(sky, np.float64) * (up * 0.18)[:, None]
    if ground is not None:
        out = out + np.asarray(ground, np.float64) * ((1 - up) * 0.12)[:, None]
    return np.clip(out, 0, 255).astype(np.float32), n


def render(cam, meshes, light=(-0.4, 0.8, -0.45), ambient=0.42, bg=(0, 0, 0), sky=None, ground=None,
           rgb=None, depth=None, ids=None, shaded=True):
    """Draw meshes into (rgb (H,W,3) float, depth (H,W), ids (H,W)). Pass existing
    buffers to draw on top of them."""
    W, H = cam.W, cam.H
    if rgb is None:
        rgb = np.empty((H, W, 3), np.float32)
        rgb[:] = bg
        depth = np.full((H, W), 1e30, np.float32)
        ids = np.zeros((H, W), np.int32)
    for m in meshes:
        v, f, c, o = m.arrays() if isinstance(m, Mesh) else m
        if not len(f):
            continue
        if shaded:
            c, _ = shade(v, f, c, light, ambient, sky, ground, cam.eye)
        sx, sy, sz = cam.project(v)
        _raster(sx.astype(np.float64), sy.astype(np.float64), sz.astype(np.float64), f, c.astype(np.float32),
                o.astype(np.int32), W, H, rgb, depth, ids)
    return rgb, depth, ids
