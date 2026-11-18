"""3D for the traveller's paper props (kit_papers.py).

The paper is drawn by hand, flat, as a front and a back image. To show it as
a real object it is laid onto a thin sheet in 3D - a grid of little quads
that can bend (a curled corner, a scroll rolling up), with its cut edges
extruded into a rim so the card has a thickness - and rasterised:

  - every pixel keeps the sheet coordinate (u, v) of the nearest surface, so
    the hand-drawn image is looked up, not resampled. Where the sheet is seen
    at a slant a pixel covers several texels; it then takes the texel that
    stands out most from its neighbours (ink lines and highlights survive,
    flat paper gives way) instead of whichever one happens to be nearest
  - light is applied by stepping each pixel along its own colour ramp (palette
    true: the paper never turns muddy), in bands
  - then a selective outline (a darker shade of the inside on the lit side, a
    warm near-black on the shadow side, a dark line where a near part crosses
    a far one), lone specks cleaned away, and an optional flat drop shadow.

Coordinates: x right, y down (pixels), z toward the viewer. The camera is a
mild perspective that maps the plane z = zref one-to-one, so a sheet lying
face-on at rest comes out exactly as drawn."""
import math
import numpy as np
from numba import njit
from scipy import ndimage
import pixel
from pixel import RAMPS, PAL, LOOKUP

INK = (40, 24, 34)                     # warm near-black: shadow-side outline
SHADOW_RGBA = (44, 26, 40, 92)         # flat drop shadow
LIGHT = np.array([-0.52, -0.62, 0.59])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

# shadows are cast by a steeper light than the shading: short contact shadows read best in a sprite
SHADOW_L = np.array([-0.2, -0.24, 1.0])
SHADOW_L = SHADOW_L / np.linalg.norm(SHADOW_L)

SHEET, RIM = 1, 2                      # materials 3+ are solids (wood, steel, cord...)
SHEET_BACK = 11                        # the back layer of a sheet (drawn as SHEET, face 1)


# ---------------------------------------------------------------- palette
def add_ramps(d):
    """Register extra ramps (names prefixed pap_) into the shared palette."""
    for name, cols in d.items():
        assert name.startswith('pap_'), name
        cols = [tuple(c) for c in cols]
        RAMPS[name] = cols
        for i, c in enumerate(cols):
            PAL[f'{name}{i}'] = c
            if c in LOOKUP and LOOKUP[c][0] != name:
                raise ValueError(f'colour {c} of {name} already in ramp {LOOKUP[c][0]}')
            LOOKUP[c] = (name, i)


def _key(rgb):
    rgb = np.asarray(rgb)
    return (rgb[..., 0].astype(np.int64) << 16) | (rgb[..., 1].astype(np.int64) << 8) | rgb[..., 2].astype(np.int64)


def ramp_shift(rgb, mask, k):
    """Step every masked pixel of an (h, w, 3) array along its own ramp by k
    (int or int array). Colours outside the palette ramps stay as they are."""
    if not mask.any():
        return rgb
    k = np.broadcast_to(np.asarray(k, int), mask.shape)
    keys = _key(rgb)
    sel = mask & (k != 0)
    if not sel.any():
        return rgb
    pairs = np.stack([keys[sel], k[sel]], 1)
    uniq, inv = np.unique(pairs, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    newc = np.zeros((len(uniq), 3), np.uint8)
    for i, (kk, st) in enumerate(uniq):
        c = (int(kk) >> 16 & 255, int(kk) >> 8 & 255, int(kk) & 255)
        newc[i] = pixel.step(c, int(st))
    vals = rgb[sel]
    vals[:] = newc[inv]
    rgb[sel] = vals
    return rgb


# ---------------------------------------------------------------- meshes
class Mesh:
    """Triangles with per-vertex position, normal and (u, v); per-triangle
    material and a small depth bias."""

    def __init__(self, P, N, UV, T, mat, bias=0.0):
        self.P = np.asarray(P, float).reshape(-1, 3)
        self.N = np.asarray(N, float).reshape(-1, 3)
        self.UV = np.asarray(UV, float).reshape(-1, 2)
        self.T = np.asarray(T, np.int64).reshape(-1, 3)
        self.mat = np.broadcast_to(np.asarray(mat, np.int64), (len(self.T),)).copy()
        self.bias = np.broadcast_to(np.asarray(bias, float), (len(self.T),)).copy()

    def transformed(self, R=None, t=(0, 0, 0), about=(0, 0, 0)):
        R = np.eye(3) if R is None else np.asarray(R, float)
        a = np.asarray(about, float)
        P = (self.P - a) @ R.T + a + np.asarray(t, float)
        N = self.N @ R.T
        return Mesh(P, N, self.UV, self.T, self.mat, self.bias)

    @staticmethod
    def join(ms):
        ms = [m for m in ms if m is not None and len(m.T)]
        off = 0
        P, N, UV, T, M, B = [], [], [], [], [], []
        for m in ms:
            P.append(m.P); N.append(m.N); UV.append(m.UV); T.append(m.T + off); M.append(m.mat); B.append(m.bias)
            off += len(m.P)
        if not ms:
            return Mesh(np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 2)), np.zeros((0, 3)), np.zeros(0))
        return Mesh(np.concatenate(P), np.concatenate(N), np.concatenate(UV), np.concatenate(T),
                    np.concatenate(M), np.concatenate(B))


def grid_tris(nu, nv):
    """Triangles of an (nv+1) x (nu+1) vertex grid, wound so that a sheet
    facing the viewer has a positive screen area."""
    i = np.arange(nu)
    j = np.arange(nv)
    I, J = np.meshgrid(i, j)
    a = (J * (nu + 1) + I).reshape(-1)
    b = a + 1
    c = a + (nu + 1)
    d = c + 1
    return np.concatenate([np.stack([a, b, c], 1), np.stack([b, d, c], 1)])


def sheet_mesh(surf, W, H, du=1.0, dv=1.0, alpha=None, tau=1.0, u_range=(0.0, 1.0), rim_mat=RIM):
    """A two-sided sheet W x H texels. surf(U, V) -> (P, N): U, V in texels
    (arrays), P the mid-surface points and N the front normals. The front and
    back faces sit tau/2 either side of the mid-surface; the edges of the
    alpha mask (torn corners, punched holes) are extruded into the rim.
    u_range limits the sheet to a strip (in units of W)."""
    u0, u1 = u_range[0] * W, u_range[1] * W
    nu = max(1, int(math.ceil((u1 - u0) / du)))
    nv = max(1, int(math.ceil(H / dv)))
    us = np.linspace(u0, u1, nu + 1)
    vs = np.linspace(0, H, nv + 1)
    U, V = np.meshgrid(us, vs)
    P, N = surf(U.reshape(-1), V.reshape(-1))
    T = grid_tris(nu, nv)
    UV = np.stack([U.reshape(-1) / W, V.reshape(-1) / H], 1)
    front = Mesh(P + N * tau / 2, N, UV, T, SHEET)
    # the back face: same grid, its own layer (winding reversed => seen from behind)
    back = Mesh(P - N * tau / 2, N, UV, T[:, ::-1], SHEET_BACK)
    parts = [front, back]
    if alpha is not None and tau > 0:
        parts.append(rim_mesh(surf, alpha, tau, u0, u1, rim_mat))
    return Mesh.join(parts)


def rim_mesh(surf, alpha, tau, u0, u1, mat=RIM):
    """Quads standing on every texel edge between paper and air."""
    H, W = alpha.shape
    a = np.pad(alpha, 1)
    segs = []
    # vertical edges: between (x-1, y) and (x, y)
    left = a[1:-1, :-1] != a[1:-1, 1:]                     # (H, W+1): edge at x
    ys, xs = np.nonzero(left)
    for y, x in zip(ys, xs):
        segs.append((x, y, x, y + 1))
    top = a[:-1, 1:-1] != a[1:, 1:-1]                      # (H+1, W): edge at y
    ys, xs = np.nonzero(top)
    for y, x in zip(ys, xs):
        segs.append((x, y, x + 1, y))
    if not segs:
        return None
    s = np.array(segs, float)
    keep = (np.maximum(s[:, 0], s[:, 2]) > u0 - 1e-6) & (np.minimum(s[:, 0], s[:, 2]) < u1 + 1e-6)
    s = s[keep]
    if not len(s):
        return None
    s[:, 0] = np.clip(s[:, 0], u0, u1)
    s[:, 2] = np.clip(s[:, 2], u0, u1)
    Ua = np.concatenate([s[:, 0], s[:, 2]])
    Va = np.concatenate([s[:, 1], s[:, 3]])
    P, N = surf(Ua, Va)
    n = len(s)
    Pa, Pb = P[:n], P[n:]
    Na, Nb = N[:n], N[n:]
    # outward direction of the rim face: along the surface, perpendicular to the edge
    e = Pb - Pa
    side = np.cross(e, Na)
    side /= np.linalg.norm(side, axis=1, keepdims=True) + 1e-12
    V4 = np.concatenate([Pa + Na * tau / 2, Pb + Nb * tau / 2, Pa - Na * tau / 2, Pb - Nb * tau / 2])
    N4 = np.concatenate([side, side, side, side])
    UV4 = np.zeros((4 * n, 2))
    uvA = np.stack([s[:, 0], s[:, 1]], 1)
    uvB = np.stack([s[:, 2], s[:, 3]], 1)
    UV4[:] = np.concatenate([uvA, uvB, uvA, uvB])
    i = np.arange(n)
    T = np.concatenate([np.stack([i, i + n, i + 2 * n], 1), np.stack([i + n, i + 3 * n, i + 2 * n], 1)])
    return Mesh(V4, N4, UV4, T, mat, bias=-0.05)


def lathe(profile, axis_a, axis_b, mat, seg=24, cap_top=True, cap_bot=True, phase=0.0):
    """Surface of revolution. profile: [(t, r)] with t 0..1 from axis_a to
    axis_b. UV: (angle/2pi, t)."""
    a = np.asarray(axis_a, float)
    b = np.asarray(axis_b, float)
    ax = b - a
    L = np.linalg.norm(ax)
    ax /= L
    tmp = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = np.cross(ax, tmp)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(ax, e1)
    prof = np.asarray(profile, float)
    ts, rs = prof[:, 0], prof[:, 1]
    # profile slope for normals
    dr = np.gradient(rs) if len(rs) > 1 else np.zeros_like(rs)
    dt = np.gradient(ts * L) if len(ts) > 1 else np.ones_like(ts)
    ang = np.linspace(0, 2 * np.pi, seg + 1)[:-1] + phase
    P, N, UV = [], [], []
    for t, r, s1, s2 in zip(ts, rs, dr, dt):
        for k, an in enumerate(ang):
            radial = math.cos(an) * e1 + math.sin(an) * e2
            P.append(a + ax * t * L + radial * r)
            n = radial * s2 - ax * s1
            n /= np.linalg.norm(n) + 1e-12
            N.append(n)
            UV.append((k / seg, t))
    P, N, UV = np.array(P), np.array(N), np.array(UV)
    T = []
    nt = len(ts)
    for i in range(nt - 1):
        for k in range(seg):
            p0 = i * seg + k
            p1 = i * seg + (k + 1) % seg
            q0 = p0 + seg
            q1 = p1 + seg
            T += [(p0, p1, q0), (p1, q1, q0)]
    parts = [Mesh(P, N, UV, T, mat)]
    for cap, idx, sgn in ((cap_bot, 0, -1), (cap_top, nt - 1, 1)):
        if cap and rs[idx] > 0:
            c = a + ax * ts[idx] * L
            ring = P[idx * seg:(idx + 1) * seg]
            CP = np.concatenate([[c], ring])
            CN = np.tile(ax * sgn, (seg + 1, 1))
            CUV = np.concatenate([[(0.5, ts[idx])], UV[idx * seg:(idx + 1) * seg]])
            CT = [(0, 1 + k, 1 + (k + 1) % seg) for k in range(seg)]
            parts.append(Mesh(CP, CN, CUV, CT, mat))
    return Mesh.join(parts)


def box(c, half, R=None, mat=3):
    """Axis box (then rotated by R about its centre)."""
    c = np.asarray(c, float)
    hx, hy, hz = half
    R = np.eye(3) if R is None else np.asarray(R, float)
    faces = []
    for ax in range(3):
        for sgn in (-1, 1):
            n = np.zeros(3); n[ax] = sgn
            u_ax, v_ax = [i for i in range(3) if i != ax]
            hs = np.array([hx, hy, hz])
            corners = []
            for (su, sv) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                p = np.zeros(3)
                p[ax] = sgn * hs[ax]
                p[u_ax] = su * hs[u_ax]
                p[v_ax] = sv * hs[v_ax]
                corners.append(p)
            faces.append((np.array(corners), n))
    P, N, UV, T = [], [], [], []
    for fi, (cs, n) in enumerate(faces):
        base = len(P)
        for p, uv in zip(cs, ((0, 0), (1, 0), (0, 1), (1, 1))):
            P.append(R @ p + c)
            N.append(R @ n)
            UV.append(uv)
        T += [(base, base + 1, base + 2), (base + 1, base + 3, base + 2)]
    return Mesh(P, N, UV, T, mat)


# ---------------------------------------------------------------- camera
class Camera:
    def __init__(self, w, h, f=400.0, zref=0.0, centre=None):
        self.w, self.h, self.f, self.zref = w, h, f, zref
        self.c = np.array(centre if centre is not None else (w / 2, h / 2), float)

    def project(self, P):
        s = self.f / (self.f - (P[:, 2] - self.zref))
        sx = self.c[0] + (P[:, 0] - self.c[0]) * s
        sy = self.c[1] + (P[:, 1] - self.c[1]) * s
        return sx, sy, P[:, 2].copy()


# ---------------------------------------------------------------- rasteriser
@njit(cache=True)
def _raster(sx, sy, sz, T, tmat, tbias, UV, NV, TW, TH, af, ab, zb, mb, fb, ub, vb, nb, tb):
    h, w = zb.shape
    for t in range(T.shape[0]):
        i0, i1, i2 = T[t, 0], T[t, 1], T[t, 2]
        x0, y0, x1, y1, x2, y2 = sx[i0], sy[i0], sx[i1], sy[i1], sx[i2], sy[i2]
        A = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(A) < 1e-10:
            continue
        m = tmat[t]
        face = 0
        if m == 1 or m == 11:
            if A <= 0:
                continue                                   # each layer of a sheet is seen from its own side
            face = 1 if m == 11 else 0
            m = 1
        xmin = max(0, int(math.floor(min(x0, min(x1, x2)))))
        xmax = min(w - 1, int(math.ceil(max(x0, max(x1, x2)))))
        ymin = max(0, int(math.floor(min(y0, min(y1, y2)))))
        ymax = min(h - 1, int(math.ceil(max(y0, max(y1, y2)))))
        for py in range(ymin, ymax + 1):
            cy = py + 0.5
            for px in range(xmin, xmax + 1):
                cx = px + 0.5
                w0 = ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)) / A
                w1 = ((x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2)) / A
                w2 = 1.0 - w0 - w1
                if w0 < -1e-9 or w1 < -1e-9 or w2 < -1e-9:
                    continue
                z = w0 * sz[i0] + w1 * sz[i1] + w2 * sz[i2] + tbias[t]
                if z <= zb[py, px]:
                    continue
                u = w0 * UV[i0, 0] + w1 * UV[i1, 0] + w2 * UV[i2, 0]
                v = w0 * UV[i0, 1] + w1 * UV[i1, 1] + w2 * UV[i2, 1]
                if m == 1:
                    tx = min(TW - 1, max(0, int(math.floor(u * TW))))
                    ty = min(TH - 1, max(0, int(math.floor(v * TH))))
                    if face == 0:
                        if not af[ty, tx]:
                            continue
                    else:
                        if not ab[ty, TW - 1 - tx]:
                            continue
                zb[py, px] = z
                mb[py, px] = m
                fb[py, px] = face
                ub[py, px] = u
                vb[py, px] = v
                tb[py, px] = t
                for k in range(3):
                    nb[py, px, k] = w0 * NV[i0, k] + w1 * NV[i1, k] + w2 * NV[i2, k]


def raster(mesh, cam, tex_shape=(1, 1), af=None, ab=None):
    w, h = cam.w, cam.h
    g = dict(z=np.full((h, w), -1e9), mat=np.zeros((h, w), np.int64), face=np.zeros((h, w), np.int64),
             u=np.zeros((h, w)), v=np.zeros((h, w)), n=np.zeros((h, w, 3)), tri=np.full((h, w), -1, np.int64))
    if len(mesh.T) == 0:
        return g
    sx, sy, sz = cam.project(mesh.P)
    TH, TW = tex_shape
    if af is None:
        af = np.ones((TH, TW), np.bool_)
    if ab is None:
        ab = af[:, ::-1].copy()
    _raster(sx, sy, sz, mesh.T, mesh.mat, mesh.bias, mesh.UV, mesh.N, TW, TH, af.astype(np.bool_),
            ab.astype(np.bool_), g['z'], g['mat'], g['face'], g['u'], g['v'], g['n'], g['tri'])
    nn = np.linalg.norm(g['n'], axis=-1, keepdims=True)
    g['n'] = g['n'] / np.maximum(nn, 1e-9)
    return g


# ---------------------------------------------------------------- texture lookup
def salience(tex):
    """How much each texel stands out from its 3x3 neighbourhood."""
    lum = tex[..., :3].astype(float) @ np.array([0.3, 0.55, 0.15])
    op = tex[..., 3] > 0
    p = np.pad(np.where(op, lum, 0.0), 1, mode='edge')
    q = np.pad(op.astype(float), 1, mode='edge')
    tot = sum(p[dy:dy + lum.shape[0], dx:dx + lum.shape[1]] for dy in range(3) for dx in range(3))
    cnt = sum(q[dy:dy + lum.shape[0], dx:dx + lum.shape[1]] for dy in range(3) for dx in range(3))
    mean = tot / np.maximum(cnt, 1)
    return np.where(op, np.abs(lum - mean), -1.0)


@njit(cache=True)
def _lookup(tex, sal, TX, TY, FX, FY, sel, out):
    TH, TW = tex.shape[0], tex.shape[1]
    h, w = sel.shape
    for y in range(h):
        for x in range(w):
            if not sel[y, x]:
                continue
            cx, cy = TX[y, x], TY[y, x]
            fx, fy = FX[y, x], FY[y, x]
            ix = min(TW - 1, max(0, int(math.floor(cx))))
            iy = min(TH - 1, max(0, int(math.floor(cy))))
            bi, bj = ix, iy
            if fx > 1.25 or fy > 1.25:
                rx = max(0.0, fx * 0.5 - 0.5)
                ry = max(0.0, fy * 0.5 - 0.5)
                x0 = max(0, int(math.floor(cx - rx)))
                x1 = min(TW - 1, int(math.floor(cx + rx)))
                y0 = max(0, int(math.floor(cy - ry)))
                y1 = min(TH - 1, int(math.floor(cy + ry)))
                best = -1e9
                for j in range(y0, y1 + 1):
                    for i in range(x0, x1 + 1):
                        if tex[j, i, 3] == 0:
                            continue
                        d = (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2
                        s = sal[j, i] - d * 0.02
                        if s > best:
                            best = s
                            bi, bj = i, j
            for k in range(4):
                out[y, x, k] = tex[bj, bi, k]


def _footprint(T, same):
    """Texel extent of one pixel from finite differences (one-sided where the
    neighbour is another surface)."""
    h, w = T.shape
    dx = np.zeros((h, w))
    dy = np.zeros((h, w))
    r = np.zeros((h, w)); r[:, :-1] = np.abs(T[:, 1:] - T[:, :-1])
    l = np.zeros((h, w)); l[:, 1:] = r[:, :-1]
    rs = np.zeros((h, w), bool); rs[:, :-1] = same[:, :-1, 0]
    ls = np.zeros((h, w), bool); ls[:, 1:] = same[:, :-1, 0]
    dx = np.where(rs, r, np.where(ls, l, 0.0))
    d_ = np.zeros((h, w)); d_[:-1] = np.abs(T[1:] - T[:-1])
    u_ = np.zeros((h, w)); u_[1:] = d_[:-1]
    ds = np.zeros((h, w), bool); ds[:-1] = same[:-1, :, 1]
    us = np.zeros((h, w), bool); us[1:] = same[:-1, :, 1]
    dy = np.where(ds, d_, np.where(us, u_, 0.0))
    return dx, dy


def lookup(g, front, back, sal_f=None, sal_b=None):
    """Sheet pixels -> texels of the hand-drawn front / back images."""
    h, w = g['z'].shape
    TH, TW = front.shape[:2]
    out = np.zeros((h, w, 4), np.uint8)
    sheet = g['mat'] == SHEET
    exact = np.zeros((h, w), bool)
    if not sheet.any():
        return out, sheet, exact
    surf = np.where(sheet, g['face'] + 1, 0)
    same = np.zeros((h, w, 2), bool)
    same[:, :-1, 0] = (surf[:, :-1] == surf[:, 1:]) & (surf[:, :-1] > 0)
    same[:-1, :, 1] = (surf[:-1] == surf[1:]) & (surf[:-1] > 0)
    # depth continuity too: a curl crossing the flat sheet is another surface
    zc = np.abs(np.diff(g['z'], axis=1)) < 1.5
    same[:, :-1, 0] &= zc
    zr = np.abs(np.diff(g['z'], axis=0)) < 1.5
    same[:-1, :, 1] &= zr
    TX = g['u'] * TW
    TY = g['v'] * TH
    for face, tex, sal in ((0, front, sal_f), (1, back, sal_b)):
        sel = sheet & (g['face'] == face)
        if not sel.any():
            continue
        tx = TX if face == 0 else TW - TX
        if sal is None:
            sal = salience(tex)
        # texel extent of a pixel along each texture axis (both screen directions count)
        txx, txy = _footprint(tx, same)
        tyx, tyy = _footprint(TY, same)
        ext_x = np.maximum(np.hypot(txx, txy), 1.0)
        ext_y = np.maximum(np.hypot(tyx, tyy), 1.0)
        _lookup(tex, sal.astype(np.float64), tx, TY, ext_x, ext_y, sel, out)
        exact[sel] = ((ext_x <= 1.08) & (ext_y <= 1.08))[sel]
    return out, sheet, exact


# ---------------------------------------------------------------- light
def bands(g, sel, n0=(0, 0, 1), cuts=(-1.02, -0.3, 0.24), flip_back=True):
    """Light step per pixel: 0 where the surface faces the way it did at rest."""
    n = g['n'].copy()
    if flip_back:
        n[g['face'] == 1] *= -1
    d = (n * LIGHT).sum(-1) - float(np.dot(np.asarray(n0, float), LIGHT))
    k = np.zeros(d.shape, int)
    k[d < cuts[1]] = -1
    k[d < cuts[0]] = -2
    k[d > cuts[2]] = 1
    return np.where(sel, k, 0)


def solid_shade(g, sel, ramp, cuts=(0.25, 0.5, 0.72, 0.9), spec=None, spec_col=None, amb=0.0):
    """Banded lighting of a solid (wood, steel...) from its own ramp."""
    n = g['n']
    v = np.clip((n * LIGHT).sum(-1) * 0.5 + 0.5 + amb, 0, 1)
    cols = RAMPS[ramp] if isinstance(ramp, str) else ramp
    k = np.zeros(v.shape, int)
    for i, c in enumerate(cuts):
        k[v > c] = i + 1
    k = np.clip(k, 0, len(cols) - 1)
    out = np.zeros(sel.shape + (3,), np.uint8)
    pal = np.array(cols, np.uint8)
    out[sel] = pal[k[sel]]
    if spec is not None:
        hv = LIGHT + np.array([0, 0, 1.0])
        hv /= np.linalg.norm(hv)
        sp = (n * hv).sum(-1)
        gl = sel & (sp > spec)
        out[gl] = spec_col if spec_col is not None else pal[-1]
    return out


# ---------------------------------------------------------------- post
def _nb(a, dy, dx, fill):
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def depth_lines(rgba, z, gap=1.6, mask=None):
    """A darker line on the far side of every depth break (where a near part
    crosses a far one)."""
    m = rgba[..., 3] == 255
    if mask is not None:
        m &= mask
    zz = np.where(m, z, -1e9)
    brk = np.zeros(m.shape, bool)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        brk |= m & (_nb(zz, dy, dx, -1e9) > zz + gap)
    rgb = rgba[..., :3].copy()
    ramp_shift(rgb, brk, -2)
    rgba[..., :3] = rgb
    return rgba


def outline(rgba, lit_step=-3, skip_holes=True, ink=INK):
    """Selective outline around the opaque pixels: on the lit (upper-left)
    side a darker shade of the colour inside, on the shadow side a warm
    near-black. Holes inside the object (punched, eyelets) are left open."""
    a = rgba
    m = a[..., 3] == 255
    empty = ~m
    if skip_holes:
        lab, n = ndimage.label(empty)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        outer = np.isin(lab, list(border))
    else:
        outer = empty
    nbm = {d: _nb(m, d[0], d[1], False) for d in ((0, -1), (-1, 0), (0, 1), (1, 0))}
    # nbm[(0,-1)] = pixel to the right is solid; (-1,0) = pixel below is solid
    edge = outer & (nbm[(0, -1)] | nbm[(-1, 0)] | nbm[(0, 1)] | nbm[(1, 0)])
    lit = (nbm[(0, -1)] | nbm[(-1, 0)]) & ~(nbm[(0, 1)] | nbm[(1, 0)])
    src = np.where(nbm[(0, -1)][..., None], _nb(a, 0, -1, 0),
                   np.where(nbm[(-1, 0)][..., None], _nb(a, -1, 0, 0),
                            np.where(nbm[(0, 1)][..., None], _nb(a, 0, 1, 0), _nb(a, 1, 0, 0))))
    out = a.copy()
    rgb = src[..., :3].copy()
    ramp_shift(rgb, edge & lit, lit_step)
    out[edge & lit, :3] = rgb[edge & lit]
    out[edge & ~lit, :3] = ink
    out[edge, 3] = 255
    return out


def tidy(rgba, keep=None):
    """Lone specks - a pixel unlike all four neighbours, three of which agree -
    take their colour (keep: pixels to leave alone)."""
    a = rgba
    c = a.astype(np.int64)
    key = (c[..., 0] << 24) | (c[..., 1] << 16) | (c[..., 2] << 8) | c[..., 3]
    p = np.pad(key, 1, mode='edge')
    up, dn, lf, rt = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
    diff = (key != up) & (key != dn) & (key != lf) & (key != rt) & ((key & 255) > 0)
    if keep is not None:
        diff &= ~keep
    pa = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
    srcs = {'u': pa[:-2, 1:-1], 'd': pa[2:, 1:-1], 'l': pa[1:-1, :-2], 'r': pa[1:-1, 2:]}
    for nm, nb in (('u', up), ('d', dn), ('l', lf), ('r', rt)):
        agree = (nb == up).astype(int) + (nb == dn) + (nb == lf) + (nb == rt)
        fix = diff & (agree >= 3) & ((nb & 255) == 255)
        a[fix] = srcs[nm][fix]
        diff &= ~fix
    return a


def specks(tex):
    """Texels that are lone specks in the drawing itself (dots of a dotted
    line, a star): deliberate, so tidy() leaves them be."""
    c = tex.astype(np.int64)
    key = (c[..., 0] << 24) | (c[..., 1] << 16) | (c[..., 2] << 8) | c[..., 3]
    p = np.pad(key, 1, mode='edge')
    up, dn, lf, rt = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
    return (key != up) & (key != dn) & (key != lf) & (key != rt)


def shadow_height(mesh, cam, plane_z=0.0, min_h=1.2, light=SHADOW_L):
    """Shadow map: for every point of the table (z = plane_z) the height of
    the highest thing between it and the light (-1e9 where nothing is)."""
    P = mesh.P
    lifted = P[:, 2] > plane_z + min_h
    tl = lifted[mesh.T].any(1)
    h, w = cam.h, cam.w
    if not tl.any():
        return np.full((h, w), -1e9)
    s = (P[:, 2] - plane_z) / light[2]
    Q = P - light[None, :] * s[:, None]
    Q[:, 2] = plane_z
    sx, sy, _ = cam.project(Q)
    m = Mesh(Q, np.tile([0, 0, 1.0], (len(Q), 1)), np.zeros((len(Q), 2)), mesh.T[tl], 9)
    g = dict(z=np.full((h, w), -1e9), mat=np.zeros((h, w), np.int64), face=np.zeros((h, w), np.int64),
             u=np.zeros((h, w)), v=np.zeros((h, w)), n=np.zeros((h, w, 3)), tri=np.full((h, w), -1, np.int64))
    _raster(sx, sy, P[:, 2].copy(), m.T, m.mat, m.bias, m.UV, m.N, 1, 1, np.ones((1, 1), np.bool_),
            np.ones((1, 1), np.bool_), g['z'], g['mat'], g['face'], g['u'], g['v'], g['n'], g['tri'])
    return g['z']


def shadowed(H, z, sel, gap=1.0, light=SHADOW_L):
    """Pixels (with their height z) that something at least `gap` higher
    shades from the light."""
    h, w = H.shape
    ys, xs = np.nonzero(sel)
    zz = z[ys, xs]
    px = np.clip(np.round(xs - light[0] / light[2] * zz).astype(int), 0, w - 1)
    py = np.clip(np.round(ys - light[1] / light[2] * zz).astype(int), 0, h - 1)
    out = np.zeros((h, w), bool)
    out[ys, xs] = H[py, px] > zz + gap
    return out
