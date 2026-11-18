"""The traveller's luggage: an old leather suitcase and a boro-cloth travel
bag, sculpted in 3D (sculpt.py) and drawn frame by frame as pixel art.

    python3 kit_luggage.py [suitcase] [bag] [-j 3]

Every frame is ray-marched from a signed distance field and then drawn the
way a pixel artist would draw it:

  - a few hue-shifted tones per material, picked by how the surface faces
    the light (upper left, in front); flat planes get one tone, the rounded
    edges and the piping catch a brighter one
  - everything painted onto the object is fixed to the object, so it turns
    and hinges with it: stitching and seams are drawn as 1 px lines along
    3D curves (projected, depth-tested), stickers and the tag's writing are
    small hand-drawn images mapped onto the faces, scuffs, cracks, mud and
    stains are clusters in object space
  - a selective outline (a darker tone of what is inside on the lit side, a
    warm near-black on the shadow side, a line where a near part crosses a
    far one), then lone specks are tidied away

Props (each in traveler_kit/<name>/, see kit_export.py):

  suitcase_<variant>   clean (all animations), worn, dirty, repaired
  travel_bag_<variant> clean (all animations), worn, dirty, repaired
"""
import math
import sys
import numpy as np
import pixel
from pixel import Canvas, PAL, RAMPS, LOOKUP, text
from sculpt import Shapes, rot_x, rot_y, rot_z
from kit_export import export_prop

TAU = 2 * math.pi
FPS = 12

# ---------------------------------------------------------------- palette (dark -> light, hue-shifted)
LUG = {
    # cognac leather, polished; plum shadows, warm honey lights
    'lug_hide':   [(40, 20, 28), (68, 32, 36), (100, 46, 40), (136, 68, 46), (172, 98, 58), (204, 134, 78),
                   (232, 180, 118)],
    # the same leather, sun-faded and dry
    'lug_hidew':  [(46, 28, 34), (76, 44, 42), (108, 64, 50), (142, 92, 64), (174, 124, 84), (202, 158, 108),
                   (226, 196, 146)],
    # dark chocolate strap leather
    'lug_strap':  [(26, 16, 22), (44, 26, 30), (66, 38, 36), (92, 56, 44), (122, 80, 56), (156, 110, 76)],
    # brass: green-brown shadows, butter lights
    'lug_brass':  [(48, 34, 24), (92, 66, 32), (146, 108, 42), (198, 158, 62), (236, 206, 110), (255, 244, 196)],
    'lug_tarn':   [(40, 36, 28), (70, 62, 40), (104, 96, 56), (140, 128, 76), (176, 164, 108), (214, 206, 156)],
    'lug_steel':  [(30, 32, 44), (54, 58, 74), (86, 92, 108), (124, 130, 144), (170, 176, 184), (226, 230, 232)],
    # the lining: a teal cotton
    'lug_lining': [(22, 32, 42), (32, 52, 60), (46, 76, 80), (66, 104, 100), (98, 138, 122), (146, 176, 150)],
    'lug_card':   [(92, 74, 62), (140, 116, 90), (186, 164, 126), (220, 204, 162), (242, 232, 200)],
    'lug_thread': [(120, 96, 74), (178, 156, 120), (222, 206, 166), (244, 236, 208)],
    'lug_string': [(70, 30, 34), (118, 46, 44), (164, 70, 58), (204, 108, 82)],
    # the clothes and the tea bundle inside
    'lug_ai':     [(18, 20, 40), (28, 34, 64), (40, 52, 94), (60, 78, 128), (92, 112, 160), (140, 158, 196)],
    'lug_cream':  [(110, 98, 92), (158, 146, 128), (200, 190, 164), (230, 222, 196), (246, 242, 226)],
    'lug_beni':   [(58, 14, 30), (98, 24, 40), (146, 38, 48), (190, 60, 56), (226, 100, 78), (246, 150, 116)],
    # repairs and dirt
    'lug_patch':  [(30, 26, 22), (52, 44, 32), (80, 70, 44), (110, 98, 60), (142, 130, 82), (176, 164, 112)],
    'lug_rope':   [(70, 52, 34), (112, 88, 52), (156, 128, 76), (196, 170, 108), (226, 206, 150)],
    'lug_tape':   [(118, 106, 96), (164, 150, 128), (204, 192, 160), (232, 224, 194)],
    'lug_mud':    [(34, 26, 24), (56, 44, 36), (82, 66, 50), (110, 92, 68), (138, 120, 90)],
    'lug_dust':   [(118, 104, 92), (150, 136, 118), (180, 168, 146), (208, 198, 176)],
    'lug_hole':   [(14, 10, 16), (26, 18, 26), (40, 28, 36)],
}
for _n, _cols in LUG.items():
    RAMPS[_n] = _cols
    for _i, _c in enumerate(_cols):
        PAL[f'{_n}{_i}'] = _c
        LOOKUP.setdefault(_c, (_n, _i))
INK = (30, 18, 24)                      # the warm near-black of the shadow-side outline

KEY = np.array((-0.55, 0.7, 0.6))
KEY = KEY / np.linalg.norm(KEY)
HALF = (KEY + np.array((0, 0, 1.0)))
HALF = HALF / np.linalg.norm(HALF)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47


# ---------------------------------------------------------------- materials
class Mat:
    def __init__(self, ramp, cuts, soft=0.0, gloss=0.0, sheen=0.0):
        self.ramp, self.cuts, self.soft, self.gloss, self.sheen = ramp, cuts, soft, gloss, sheen


def _cuts(k, lo=0.24, hi=0.96, bias=1.0):
    return [lo + (hi - lo) * ((i + 1) / k) ** bias for i in range(k - 1)]


MATS = {}
M_HIDE, M_STRAP, M_BRASS, M_LINING, M_CARD, M_STRING, M_AI, M_CREAM, M_BENI, M_STEEL, M_ROPE, M_PATCH, \
    M_TAPE, M_MUD, M_THREAD, M_HOLE, M_POCKET, M_TARN, M_HIDEW = range(1, 20)
MATS[M_HIDE] = Mat('lug_hide', [0.22, 0.42, 0.58, 0.76, 0.95, 0.995], sheen=0.0)
MATS[M_HIDEW] = Mat('lug_hidew', [0.22, 0.42, 0.58, 0.76, 0.95, 0.995])
MATS[M_STRAP] = Mat('lug_strap', [0.25, 0.45, 0.62, 0.8, 0.97])
MATS[M_BRASS] = Mat('lug_brass', [0.3, 0.5, 0.68, 0.86, 0.995], gloss=0.94)
MATS[M_TARN] = Mat('lug_tarn', [0.3, 0.5, 0.68, 0.88, 0.995], gloss=0.985)
MATS[M_STEEL] = Mat('lug_steel', [0.3, 0.5, 0.66, 0.84, 0.99], gloss=0.95)
MATS[M_LINING] = Mat('lug_lining', [0.2, 0.36, 0.52, 0.7, 0.9], soft=0.08)
MATS[M_POCKET] = Mat('lug_lining', [0.24, 0.4, 0.56, 0.76, 0.93], soft=0.08)
MATS[M_CARD] = Mat('lug_card', [0.3, 0.5, 0.7, 0.88])
MATS[M_STRING] = Mat('lug_string', [0.35, 0.6, 0.85])
MATS[M_AI] = Mat('lug_ai', [0.24, 0.4, 0.56, 0.74, 0.93], soft=0.1)
MATS[M_CREAM] = Mat('lug_cream', [0.3, 0.5, 0.7, 0.88], soft=0.08)
MATS[M_BENI] = Mat('lug_beni', [0.24, 0.4, 0.56, 0.74, 0.93], soft=0.08)
MATS[M_ROPE] = Mat('lug_rope', [0.3, 0.5, 0.7, 0.9], soft=0.05)
MATS[M_PATCH] = Mat('lug_patch', [0.22, 0.42, 0.6, 0.8, 0.97])
MATS[M_TAPE] = Mat('lug_tape', [0.35, 0.6, 0.85])
MATS[M_MUD] = Mat('lug_mud', [0.3, 0.5, 0.7, 0.9])
MATS[M_THREAD] = Mat('lug_thread', [0.35, 0.6, 0.85])
MATS[M_HOLE] = Mat('lug_hole', [0.5, 0.8])

NMAT = 64                                # mat id = group * NMAT + material


def ramp_arr(name):
    return np.array(RAMPS[name], np.uint8)


# ---------------------------------------------------------------- rig: shapes in hinged groups
class Rig:
    """Shapes grouped into rigid parts. Each group has a transform
    local -> object (R, t); details are painted in the group's local space,
    so a lid keeps its stickers as it hinges open."""

    def __init__(self):
        self.S = Shapes()
        self.T = {0: (np.eye(3), np.zeros(3))}
        self.g = 0

    def group(self, gid, R=None, t=None):
        self.T[gid] = (np.eye(3) if R is None else np.asarray(R, float), np.zeros(3) if t is None else np.asarray(t, float))
        self.g = gid

    def _p(self, p):
        R, t = self.T[self.g]
        return tuple(R @ np.asarray(p, float) + t)

    def _r(self, rot):
        R, _ = self.T[self.g]
        return R if rot is None else R @ np.asarray(rot, float)

    def m(self, mat):
        return self.g * NMAT + mat

    def box(self, c, half, rot=None, round=0.0, k=0.0, mat=M_HIDE, op=0):
        self.S.box(self._p(c), half, rot=self._r(rot), round=round, k=k, mat=self.m(mat), op=op)

    def ell(self, c, r, rot=None, k=0.0, mat=M_HIDE, op=0):
        self.S.ell(self._p(c), r, rot=self._r(rot), k=k, mat=self.m(mat), op=op)

    def cap(self, a, b, r0, r1=None, k=0.0, mat=M_HIDE, op=0):
        self.S.cap(self._p(a), self._p(b), r0, r1, k=k, mat=self.m(mat), op=op)

    def to_obj(self, gid, p):
        R, t = self.T[gid]
        return np.asarray(p, float) @ R.T + t


# ---------------------------------------------------------------- the frame context
class Frame:
    """Trace a rig and hold everything a painter needs: per pixel the
    material, group, local point and normal, light, ramp index, and an
    override colour layer for lines and decals."""

    def __init__(self, rig, size, scale, origin, yaw, pitch, squash=(1.0, 1.0, 1.0), bound=2.6, steps=110):
        self.rig = rig
        self.w, self.h = size
        self.scale = scale
        self.origin = origin
        V = rot_x(pitch) @ rot_y(-yaw)
        self.V = V
        self.Sq = np.diag(squash)
        W = V @ np.diag([1.0 / s for s in squash])
        g = rig.S.trace(self.w, self.h, scale, origin, W, bound=bound, steps=steps)
        self.g = g
        n = g['n']
        n = n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9)
        self.n = n
        hit = g['hit']
        self.hit = hit
        mat = g['mat']
        self.gid = np.where(hit, mat // NMAT, -1)
        self.mid = np.where(hit, mat % NMAT, 0)
        # local point & normal per pixel
        P = g['p']
        nobj = np.einsum('ji,hwj->hwi', W, n)          # back to object space (W rows dotted)
        nobj = nobj / (np.linalg.norm(nobj, axis=-1, keepdims=True) + 1e-9)
        self.q = np.zeros_like(P)
        self.nq = np.zeros_like(P)
        for gid, (R, t) in rig.T.items():
            sel = self.gid == gid
            if not sel.any():
                continue
            self.q[sel] = (P[sel] - t) @ R
            self.nq[sel] = nobj[sel] @ R
        self.pobj = P
        nl = (n * KEY).sum(-1)
        v = 0.5 + 0.5 * nl
        self.v = np.where(hit, v * (0.7 + 0.3 * g['ao']), 0)
        self.spec = np.clip((n * HALF).sum(-1), 0, 1)
        self.idx = np.zeros((self.h, self.w), int)
        self.over = np.zeros((self.h, self.w, 3), np.uint8)
        self.has = np.zeros((self.h, self.w), bool)
        self.keep = np.zeros((self.h, self.w), bool)       # pixels tidy() must leave alone
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        self.bay = BAYER[yy % 4, xx % 4]

    # -- projection of object/local points to the screen
    def project(self, p_obj):
        p = np.asarray(p_obj, float) @ self.Sq.T
        v = p @ self.V.T
        x = self.origin[0] + v[..., 0] * self.scale
        y = self.origin[1] - v[..., 1] * self.scale
        return x, y, v[..., 2]

    def sel(self, gid=None, mat=None):
        s = self.hit.copy()
        if gid is not None:
            s &= np.isin(self.gid, np.atleast_1d(gid))
        if mat is not None:
            s &= np.isin(self.mid, np.atleast_1d(mat))
        return s

    def face(self, axis, sign, tol=0.75):
        """Pixels whose local normal points along +-axis."""
        return self.nq[..., axis] * sign > tol

    def band(self, mat_sel=None):
        """Light -> ramp index for every material."""
        for mid, M in MATS.items():
            s = self.hit & (self.mid == mid)
            if mat_sel is not None:
                s &= mat_sel
            if not s.any():
                continue
            v = self.v.copy()
            if M.soft:
                v = v + self.bay * M.soft
            i = np.zeros(v.shape, int)
            for c in M.cuts:
                i += (v > c)
            self.idx[s] = i[s]

    def setmat(self, sel, mid):
        """Re-material pixels (keeps their light)."""
        self.mid[sel] = mid

    def colour(self, sel, ramp, di=0, base_mat=None, idx=None):
        """Override colour from ramp at the pixel's own light band (+di)."""
        r = RAMPS[ramp]
        if idx is None:
            ii = self.idx + di
        else:
            ii = np.full(self.idx.shape, idx) if np.isscalar(idx) else idx
        ii = np.clip(ii, 0, len(r) - 1)
        pal = np.array(r, np.uint8)
        self.over[sel] = pal[ii[sel]]
        self.has[sel] = True

    # -- 1 px lines along 3D curves, depth-tested against what was traced
    def line3d(self, gid, pts_local, fn, tol=0.05, dash=None, dash_phase=0.0, mats=None):
        """pts_local: (n,3) polyline in group gid's local space. fn(ys, xs)
        paints the visible pixels. dash: (period, duty) along the curve, in
        object units."""
        R, t = self.rig.T[gid]
        P = np.asarray(pts_local, float)
        # resample densely so depth and dashes follow the curve
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
        L = np.concatenate([[0], np.cumsum(seg)])
        if L[-1] <= 0:
            return
        n = max(2, int(L[-1] * self.scale * 3) + 2)
        s = np.linspace(0, L[-1], n)
        Q = np.stack([np.interp(s, L, P[:, k]) for k in range(3)], 1)
        X, Y, Z = self.project(Q @ R.T + t)
        xs, ys = np.round(X - 0.5).astype(int), np.round(Y - 0.5).astype(int)
        ok = (xs >= 0) & (xs < self.w) & (ys >= 0) & (ys < self.h)
        if dash is not None:
            ok &= np.mod(s / dash[0] + dash_phase, 1.0) < dash[1]
        out_y, out_x = [], []
        seen = set()
        for i in np.nonzero(ok)[0]:
            x, y = xs[i], ys[i]
            if (y, x) in seen:
                continue
            if not self.hit[y, x] or self.gid[y, x] != gid:
                continue
            if mats is not None and self.mid[y, x] not in mats:
                continue
            if abs(self.g['z'][y, x] - Z[i]) > tol:
                continue
            seen.add((y, x))
            out_y.append(y)
            out_x.append(x)
        if not out_y:
            return
        ys_, xs_ = np.array(out_y), np.array(out_x)
        ys_, xs_ = _thin(ys_, xs_)
        fn(ys_, xs_)

    def decal(self, sel, u, v, img, u0, v0, texel, delta=None, mask_only=False):
        """Map a hand-drawn Canvas onto the pixels in sel, (u, v) being the
        face coordinates (units) of each pixel; the image is centred on
        (u0, v0) with one texel = `texel` units. delta: per-pixel tone shift
        for the light. Returns the mask of pixels the decal covers."""
        ih, iw = img.a.shape[:2]
        iu = np.floor((u - u0) / texel + iw / 2).astype(int)
        iv = np.floor((v - v0) / texel + ih / 2).astype(int)
        inside = sel & (iu >= 0) & (iu < iw) & (iv >= 0) & (iv < ih)
        ys, xs = np.nonzero(inside)
        tex = img.a[iv[ys, xs], iu[ys, xs]]
        op = tex[:, 3] > 0
        ys, xs, tex = ys[op], xs[op], tex[op]
        m = np.zeros(sel.shape, bool)
        m[ys, xs] = True
        if mask_only:
            return m
        cols = tex[:, :3]
        if delta is not None:
            d = delta[ys, xs]
            cols = np.array([_step_rgb(tuple(int(c) for c in cc), int(dd)) for cc, dd in zip(cols, d)], np.uint8) \
                if len(cols) else cols
        self.over[ys, xs] = cols
        self.has[ys, xs] = True
        return m

    def finish(self, inner=0.06, lit_steps=2):
        """Compose, outline, tidy -> RGBA."""
        out = np.zeros((self.h, self.w, 4), np.uint8)
        for mid, M in MATS.items():
            s = self.hit & (self.mid == mid)
            if not s.any():
                continue
            pal = ramp_arr(M.ramp)
            ii = np.clip(self.idx, 0, len(pal) - 1)
            out[s, :3] = pal[ii[s]]
            out[s, 3] = 255
            if M.gloss:
                gl = s & (self.spec > M.gloss) & ~self.has
                out[gl, :3] = pal[-1]
                self.keep |= gl
        out[self.has, :3] = self.over[self.has]
        out = outline(out, self.g['z'], self.hit, inner=inner, lit_steps=lit_steps)
        return tidy(out, keep=self.keep)


def _thin(ys, xs):
    """Drop the corner pixel of every L-shaped elbow so lines stay 1 px."""
    pts = set(zip(ys.tolist(), xs.tolist()))
    drop = set()
    for (y, x) in pts:
        if (y, x) in drop:
            continue
        for dy, dx in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            if (y + dy, x + dx) in pts and (y + dy, x) in pts and (y, x + dx) not in pts:
                drop.add((y + dy, x))
            elif (y + dy, x + dx) in pts and (y, x + dx) in pts and (y + dy, x) not in pts:
                drop.add((y, x + dx))
    keep = [p for p in pts if p not in drop]
    if not keep:
        return ys, xs
    a = np.array(keep)
    return a[:, 0], a[:, 1]


_STEP_CACHE = {}


def _step_rgb(c, n):
    k = (c, n)
    if k not in _STEP_CACHE:
        _STEP_CACHE[k] = pixel.step(c, n)
    return _STEP_CACHE[k]


def step_arr(rgb, n):
    """Vectorised palette step for an (N,3) array (n scalar or (N,))."""
    n = np.broadcast_to(np.asarray(n), (len(rgb),))
    return np.array([_step_rgb(tuple(int(v) for v in c), int(k)) for c, k in zip(rgb, n)], np.uint8).reshape(-1, 3) \
        if len(rgb) else rgb


# ---------------------------------------------------------------- outline & tidy
def _shift(a, dy, dx, fill):
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def outline(rgba, z, hit, inner=0.06, lit_steps=2):
    """Selective outline. Outside: on the lit (upper-left) side a darker tone
    of the colour inside, elsewhere a warm near-black. Inside: where a near
    surface crosses a far one, the far pixel takes the dark line."""
    a = rgba
    m = a[..., 3] > 0
    out = a.copy()
    dirs = ((0, -1), (-1, 0), (0, 1), (1, 0))          # neighbour to the right, below, left, above
    nbm = [_shift(m, dy, dx, False) for dy, dx in dirs]
    nbc = [_shift(a[..., :3], dy, dx, 0) for dy, dx in dirs]
    edge = ~m & (nbm[0] | nbm[1] | nbm[2] | nbm[3])
    lit = (nbm[0] | nbm[1]) & ~(nbm[2] | nbm[3])
    first = np.where(nbm[0][..., None], nbc[0], nbc[1])
    ys, xs = np.nonzero(edge & lit)
    if len(ys):
        out[ys, xs, :3] = step_arr(first[ys, xs], -lit_steps)
    out[edge & ~lit, :3] = INK
    out[edge, 3] = 255
    # inner lines at depth breaks
    zz = np.where(m & hit, z, -1e9)
    brk = np.zeros(m.shape, bool)
    for dy, dx in dirs:
        brk |= m & hit & (_shift(zz, dy, dx, -1e9) > zz + inner)
    ys, xs = np.nonzero(brk)
    if len(ys):
        c = step_arr(out[ys, xs, :3], -2)
        dark = (c.astype(int).sum(1) > out[ys, xs, :3].astype(int).sum(1) - 30)    # ramp bottomed out
        c[dark] = INK
        out[ys, xs, :3] = c
    return out


def tidy(rgba, keep=None):
    """Lone specks - a pixel unlike all four neighbours, three of which
    agree - take that colour."""
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
        fix = diff & (agree >= 3) & ((nb & 255) > 0)
        a[fix] = srcs[nm][fix]
        diff &= ~fix
    return a


# ---------------------------------------------------------------- noise fixed to the surface
def _hash3(ix, iy, iz, seed=0):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1013904223) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0


def vnoise(p, f, seed=0):
    q = p * f
    i = np.floor(q).astype(np.int64)
    t = q - i
    t = t * t * (3 - 2 * t)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[..., 0] if dx else 1 - t[..., 0]) * (t[..., 1] if dy else 1 - t[..., 1]) * \
                    (t[..., 2] if dz else 1 - t[..., 2])
                out = out + w * _hash3(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz, seed)
    return out


def fbm(p, f, seed=0):
    return 0.6 * vnoise(p, f, seed) + 0.4 * vnoise(p, f * 2.3, seed + 7)
