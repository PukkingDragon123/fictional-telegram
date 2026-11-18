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
from numba import njit
from sculpt import Shapes, rot_x, rot_y, rot_z, _prim
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
    'lug_patch':  [(30, 16, 26), (52, 24, 38), (80, 36, 50), (110, 54, 62), (140, 78, 76), (170, 108, 96)],
    'lug_rope':   [(70, 52, 34), (112, 88, 52), (156, 128, 76), (196, 170, 108), (226, 206, 150)],
    'lug_tape':   [(150, 112, 104), (196, 156, 142), (230, 200, 176), (248, 228, 206)],
    'lug_mud':    [(48, 36, 32), (78, 62, 48), (110, 94, 72), (142, 126, 98), (172, 158, 126)],
    'lug_dusty':  [(64, 44, 44), (96, 70, 60), (128, 100, 80), (158, 130, 104), (184, 160, 130), (206, 188, 158)],
    'lug_dust':   [(118, 104, 92), (150, 136, 118), (180, 168, 146), (208, 198, 176)],
    'lug_hole':   [(14, 10, 16), (26, 18, 26), (40, 28, 36)],
    # the travel bag: boro indigo, its patches, bamboo, straw, a gourd
    'lug_aiw':    [(30, 34, 54), (44, 54, 80), (64, 78, 108), (90, 106, 138), (124, 140, 166), (168, 180, 198)],
    'lug_kaki':   [(58, 24, 24), (96, 40, 32), (140, 64, 42), (182, 96, 58), (214, 134, 86), (236, 176, 128)],
    'lug_asagi':  [(40, 58, 74), (60, 88, 104), (88, 122, 136), (124, 160, 168), (170, 198, 198)],
    'lug_ochre':  [(70, 50, 24), (112, 84, 36), (156, 120, 50), (196, 160, 74), (226, 198, 118)],
    'lug_bamboo': [(56, 46, 26), (92, 80, 38), (136, 124, 58), (180, 170, 88), (218, 210, 130), (240, 236, 184)],
    'lug_straw':  [(76, 66, 34), (116, 104, 50), (160, 146, 72), (198, 186, 104), (228, 220, 146)],
    'lug_gourd':  [(70, 34, 22), (118, 62, 30), (168, 98, 42), (210, 142, 64), (238, 190, 108), (252, 230, 170)],
    'lug_twine':  [(64, 50, 40), (104, 86, 62), (146, 126, 92), (186, 168, 128)],
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


# ---------------------------------------------------------------- materials
class Mat:
    def __init__(self, ramp, cuts, soft=0.0, gloss=0.0, sheen=0.0):
        self.ramp, self.cuts, self.soft, self.gloss, self.sheen = ramp, cuts, soft, gloss, sheen


MATS = {}
M_HIDE, M_STRAP, M_BRASS, M_LINING, M_CARD, M_STRING, M_AI, M_CREAM, M_BENI, M_STEEL, M_ROPE, M_PATCH, \
    M_TAPE, M_MUD, M_THREAD, M_HOLE, M_POCKET, M_TARN, M_HIDEW, M_PIPE, M_PIPEW = range(1, 22)
M_BAG, M_BAGW, M_KAKI, M_ASAGI, M_OCHRE, M_BAMBOO, M_STRAW, M_GOURD, M_CORD, M_WOOD, M_TINE, M_TWINE = range(22, 34)
MATS[M_HIDE] = Mat('lug_hide', [0.22, 0.42, 0.58, 0.76, 0.95, 0.995], sheen=0.0)
MATS[M_HIDEW] = Mat('lug_hidew', [0.22, 0.42, 0.58, 0.76, 0.95, 0.995])
MATS[M_PIPE] = Mat('lug_hide', [0.2, 0.36, 0.5, 0.64, 0.84, 0.97])
MATS[M_PIPEW] = Mat('lug_hidew', [0.2, 0.36, 0.5, 0.64, 0.84, 0.97])
MATS[M_STRAP] = Mat('lug_strap', [0.25, 0.45, 0.62, 0.8, 0.97])
MATS[M_BRASS] = Mat('lug_brass', [0.34, 0.56, 0.74, 0.9, 0.995], gloss=0.95)
MATS[M_TARN] = Mat('lug_tarn', [0.3, 0.5, 0.68, 0.88, 0.995], gloss=0.985)
MATS[M_STEEL] = Mat('lug_steel', [0.3, 0.5, 0.66, 0.84, 0.99], gloss=0.95)
MATS[M_LINING] = Mat('lug_lining', [0.2, 0.36, 0.52, 0.7, 0.9], soft=0.035)
MATS[M_POCKET] = Mat('lug_lining', [0.24, 0.4, 0.56, 0.76, 0.93], soft=0.035)
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
MATS[M_BAG] = Mat('lug_ai', [0.24, 0.42, 0.6, 0.8, 0.96], soft=0.03)
MATS[M_BAGW] = Mat('lug_aiw', [0.26, 0.46, 0.66, 0.86, 0.98], soft=0.03)
MATS[M_KAKI] = Mat('lug_kaki', [0.22, 0.38, 0.54, 0.72, 0.92], soft=0.06)
MATS[M_ASAGI] = Mat('lug_asagi', [0.24, 0.42, 0.6, 0.8], soft=0.06)
MATS[M_OCHRE] = Mat('lug_ochre', [0.24, 0.42, 0.6, 0.8], soft=0.06)
MATS[M_BAMBOO] = Mat('lug_bamboo', [0.28, 0.46, 0.64, 0.82, 0.97], gloss=0.985)
MATS[M_STRAW] = Mat('lug_straw', [0.3, 0.5, 0.7, 0.9])
MATS[M_GOURD] = Mat('lug_gourd', [0.26, 0.44, 0.62, 0.8, 0.96], gloss=0.95)
MATS[M_CORD] = Mat('lug_beni', [0.24, 0.42, 0.6, 0.78, 0.94])
MATS[M_WOOD] = Mat('wood', [0.2, 0.32, 0.44, 0.58, 0.74, 0.92])
MATS[M_TINE] = Mat('lug_bamboo', [0.18, 0.3, 0.46, 0.64, 0.84])
MATS[M_TWINE] = Mat('lug_twine', [0.3, 0.55, 0.8], soft=0.05)

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


@njit(cache=True)
def _remat(P, hit, kinds, ops, ks, mats, A, B, R, M, out):
    """Which primitive's surface the final field really is at each hit
    point: in a union, the one that became the new minimum; at a cut, the
    cut. (The tracer keeps the first union material it saw inside a solid,
    so parts added after a hollow would take the hollow's material.)"""
    h, w = hit.shape
    for y in range(h):
        for x in range(w):
            if not hit[y, x]:
                continue
            px, py, pz = P[y, x, 0], P[y, x, 1], P[y, x, 2]
            d = 1e9
            m = 0
            for i in range(kinds.shape[0]):
                di = _prim(px, py, pz, kinds[i], A[i], B[i], R[i], M[i])
                k = ks[i]
                if ops[i] == 0:
                    if di < d:
                        m = mats[i]
                    if k > 0:
                        hh = min(1.0, max(0.0, 0.5 + 0.5 * (d - di) / k))
                        d = d * (1 - hh) + di * hh - k * hh * (1 - hh)
                    else:
                        d = min(d, di)
                else:
                    nd_ = -di
                    if nd_ > d and mats[i] != 0:
                        m = mats[i]
                    if k > 0:
                        hh = min(1.0, max(0.0, 0.5 - 0.5 * (nd_ - d) / k))
                        d = nd_ * (1 - hh) + d * hh + k * hh * (1 - hh)
                    else:
                        d = max(d, nd_)
            out[y, x] = m


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
        _remat(g['p'], g['hit'], *rig.S.arrays(), g['mat'])
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
        self.fuzz = np.where(hit, 0.6 * vnoise(self.q, 11.0, 1) + 0.4 * vnoise(self.q, 23.0, 2), 0.5)

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
                v = v + (self.fuzz - 0.5) * M.soft * 2.4
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


# ================================================================ stickers: tiny hand-drawn images
def _disc(c, cx, cy, r, col, r0=0.0):
    for y in range(c.h):
        for x in range(c.w):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if r0 <= d <= r:
                c.px(x, y, col)


def st_mountain():
    """Round label: a snow-capped mountain under a red sun, red rim."""
    c = Canvas(19, 19)
    _disc(c, 9.5, 9.5, 9.4, 'lug_beni3')
    _disc(c, 9.5, 9.5, 7.9, 'lug_card4')
    _disc(c, 9.5, 9.5, 9.4, 'lug_beni2', 8.9)
    for y in range(11, 17):                                     # warm lower half of the paper
        for x in range(19):
            if c.get(x, y)[:3] == PAL['lug_card4']:
                c.px(x, y, 'lug_card3')
    _disc(c, 13.0, 6.0, 1.9, 'lug_beni3')                       # the sun
    for y in range(5, 15):                                      # the mountain
        half = (y - 4) * 0.82
        for x in range(19):
            dx = x + 0.5 - 9.0
            if abs(dx) <= half and c.get(x, y)[3]:
                cc = 'lug_ai3' if dx < 0 else 'lug_ai2'
                if y <= 7 or (y == 8 and int(dx) % 3 != 0):
                    cc = 'lug_cream4' if dx < 0.6 else 'lug_cream2'
                c.px(x, y, cc)
    for x in range(3, 16):                                      # the shore
        if c.get(x, 15)[3]:
            c.px(x, 15, 'lug_ai1')
    return c


def st_torii():
    """Rectangular label: a vermilion torii and a line of rune script."""
    c = Canvas(25, 15)
    c.rect(0, 0, 25, 15, 'lug_card4')
    c.frame(1, 1, 23, 13, 'lug_ai2')
    c.rect(0, 12, 25, 3, 'lug_beni3')
    c.hline(0, 24, 12, 'lug_beni2')
    # torii
    c.hline(2, 12, 3, 'lug_beni3'); c.px(2, 2, 'lug_beni3'); c.px(12, 2, 'lug_beni3')
    c.hline(3, 11, 4, 'lug_beni2')
    c.hline(4, 10, 6, 'lug_beni3')
    c.vline(7, 4, 6, 'lug_beni3')
    for x in (4, 10):
        c.vline(x, 5, 11, 'lug_beni3'); c.vline(x + 1, 5, 11, 'lug_beni2')
    text(c, 14, 3, 'KY', 'lug_ai1')
    c.hline(14, 21, 9, 'lug_ai2')
    c.px(0, 0, None); c.px(24, 0, None); c.px(0, 14, None); c.px(24, 14, None)
    return c


def st_wave():
    """Oval label: a curling wave with a foam crest."""
    c = Canvas(23, 15)
    for y in range(15):
        for x in range(23):
            d = ((x + 0.5 - 11.5) / 11.4) ** 2 + ((y + 0.5 - 7.5) / 7.4) ** 2
            if d <= 1:
                c.px(x, y, 'lug_ai1' if d > 0.8 else 'lug_card4')
    for x in range(23):                                        # the wave
        crest = 9 - 4.5 * math.exp(-((x - 9) / 4.0) ** 2) + 0.12 * (x - 9) * (x > 9)
        for y in range(15):
            if c.get(x, y)[:3] == PAL['lug_card4'] and y >= crest:
                c.px(x, y, 'lug_ai3' if y < crest + 2 else 'lug_ai2')
    for (x, y) in ((7, 5), (8, 4), (9, 4), (10, 4), (11, 5), (12, 6), (6, 6), (12, 5)):
        c.px(x, y, 'lug_cream4')                                # foam
    c.px(11, 7, 'lug_cream4'); c.px(10, 6, 'lug_ai3')
    _disc(c, 17.5, 4.5, 1.6, 'lug_beni3')
    return c


def st_teacup():
    """Square label: a teacup with steam, on jade."""
    c = Canvas(15, 15)
    c.rect(0, 0, 15, 15, 'lug_card4')
    c.rect(1, 1, 13, 13, 'jade2')
    c.rect(2, 2, 11, 11, 'jade3')
    c.px(0, 0, None); c.px(14, 0, None); c.px(0, 14, None); c.px(14, 14, None)
    for y in range(7, 12):                                     # the cup
        hw = 4 - (y - 7) * 0.6
        for x in range(15):
            if abs(x + 0.5 - 7.0) <= hw:
                c.px(x, y, 'lug_card4' if x < 7 else 'lug_card3')
    c.hline(3, 10, 7, 'lug_card3')
    c.px(11, 8, 'lug_card4'); c.px(12, 9, 'lug_card4'); c.px(11, 10, 'lug_card3')
    c.hline(4, 9, 12, 'jade1')
    for (x, y) in ((5, 5), (6, 4), (5, 3), (8, 5), (9, 4), (8, 3)):
        c.px(x, y, 'lug_card4')                                 # steam
    return c


def st_boat():
    """Ferry label: a sail boat on the sea under a red sun."""
    c = Canvas(23, 15)
    c.rect(0, 0, 23, 15, 'lug_card4')
    c.rect(1, 1, 21, 9, 'sky3')
    c.rect(1, 6, 21, 4, 'sky2')
    c.rect(1, 10, 21, 3, 'lug_ai2')
    for x in range(1, 22, 3):
        c.px(x, 10, 'lug_ai3'); c.px(x + 1, 10, 'lug_ai3')
    _disc(c, 17.5, 4.5, 2.2, 'lug_beni3')
    c.vline(9, 2, 9, 'wood1')                                   # mast and sail
    for y in range(3, 9):
        for x in range(10, 10 + (y - 2)):
            c.px(x, y, 'lug_cream4' if x < 13 else 'lug_cream3')
    c.hline(5, 14, 10, 'wood2'); c.hline(6, 13, 11, 'wood1')   # hull
    c.hline(1, 21, 13, 'lug_beni3')
    text(c, 3, 2, 'F', 'lug_ai1')
    return c


def st_station():
    """Tall station label: rune script running down, red band at the top."""
    c = Canvas(9, 26)
    c.rect(0, 0, 9, 26, 'lug_card4')
    c.rect(0, 0, 9, 4, 'lug_beni3')
    c.hline(0, 8, 4, 'lug_beni2')
    for k, ch in enumerate('TEA'):
        text(c, 3, 6 + k * 6, ch, 'lug_ai1')
    c.vline(1, 6, 23, 'lug_ai3')
    c.px(0, 25, None); c.px(8, 25, None)
    return c


def st_maple():
    """Round label: a red maple leaf."""
    c = Canvas(17, 17)
    _disc(c, 8.5, 8.5, 8.4, 'lug_card4')
    _disc(c, 8.5, 8.5, 8.4, 'gold2', 7.4)
    pts = [(8.5, 2), (9.6, 5.5), (12.8, 4.2), (11.6, 7.6), (14.5, 8.4), (11.4, 10.4), (12.2, 12.6),
           (9.2, 11.6), (9.2, 14.6), (7.8, 14.6), (7.8, 11.6), (4.8, 12.6), (5.6, 10.4), (2.5, 8.4),
           (5.4, 7.6), (4.2, 4.2), (7.4, 5.5)]
    c.poly(pts, 'lug_beni3')
    c.vline(8, 6, 13, 'lug_beni2')
    return c


def st_name():
    """The owner's label on the lid front: a brass-edged card with runes."""
    c = Canvas(21, 8)
    c.rect(0, 0, 21, 8, 'lug_card4')
    c.frame(0, 0, 21, 8, 'lug_beni2')
    text(c, 2, 2, 'SORA', 'lug_ai1')
    return c


def tag_face(back=False):
    """The luggage tag's card: address in runes, a red stamp."""
    c = Canvas(9, 15)
    c.rect(0, 0, 9, 15, 'lug_card4')
    if not back:
        c.hline(1, 7, 5, 'lug_ai2')
        text(c, 1, 6, 'TO', 'lug_ai1')
        c.hline(1, 7, 12, 'lug_ai3')
        c.rect(5, 9, 3, 3, 'lug_beni3'); c.px(6, 10, 'lug_card4')
    else:
        c.hline(1, 7, 6, 'lug_ai3'); c.hline(1, 6, 8, 'lug_ai3'); c.hline(1, 7, 10, 'lug_ai3')
    return c


STICKERS = dict(mountain=st_mountain(), torii=st_torii(), wave=st_wave(), teacup=st_teacup(), boat=st_boat(),
                station=st_station(), maple=st_maple(), name=st_name())


def faded(img, seed=0, scrape=0.0, peel=None, dirt=0.0):
    """A sticker after years of sun and handling: inks one step paler, the
    paper yellowed, patches scraped off (in clusters), optionally the part
    right of column `peel` torn away."""
    c = Canvas(img.w, img.h)
    c.a = img.a.copy()
    rng = np.random.RandomState(seed)
    h, w = c.h, c.w
    yy, xx = np.mgrid[0:h, 0:w]
    for y in range(h):
        for x in range(w):
            p = c.a[y, x]
            if not p[3]:
                continue
            rgb = tuple(int(v) for v in p[:3])
            ramp, i = LOOKUP.get(rgb, (None, None))
            if ramp in ('lug_card', 'lug_cream'):
                rgb = RAMPS['lug_card'][max(1, min(3, i - 1))]
            elif ramp is not None:
                rgb = pixel.step(rgb, 1)
            if dirt and ramp is not None and y > h * 0.5 and (x * 3 + y * 5) % 7 < 2:
                rgb = pixel.step(rgb, -1)
            c.a[y, x, :3] = rgb
    if scrape:
        m = np.zeros((h, w), bool)
        for _ in range(int(2 + 4 * scrape)):
            cx, cy = rng.uniform(0, w), rng.choice((rng.uniform(0, 3), rng.uniform(h - 3, h), rng.uniform(0, h)))
            rx, ry = rng.uniform(1.2, 2.8) * scrape + 0.6, rng.uniform(0.8, 1.8) * scrape + 0.5
            m |= ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 < 1
        c.a[m] = 0
    if peel is not None:
        c.a[:, peel:] = 0
        c.a[1:-1:3, peel - 1, 3] = 0                        # the torn edge is ragged
    return c


STICKERS_WORN = {k: faded(v, i, scrape=0.8) for i, (k, v) in enumerate(STICKERS.items())}
STICKERS_WORN['torii'] = faded(STICKERS['torii'], 9, scrape=0.4, peel=14)
STICKERS_DIRTY = {k: faded(v, i + 20, scrape=0.3, dirt=1.0) for i, (k, v) in enumerate(STICKERS.items())}
STICKERS_REP = {k: faded(v, i + 40, scrape=0.25) for i, (k, v) in enumerate(STICKERS.items())}
TORII = (0.2, 0.22)                       # where the torii label sits on the lid top (x, z)


# ================================================================ the suitcase
L2, D2 = 1.0, 0.62                 # half length, half depth
HB, HL = 0.4, 0.25                 # base and lid heights
HT = HB + HL
RB, RL = 0.075, 0.07               # edge rounding
WALL, FLOOR = 0.045, 0.05
TS, SW = 0.018, 0.13               # strap thickness, width
XS = 0.64                          # straps at +-XS
YBK = 0.26                         # buckle centre height
XL = 0.4                           # latches at +-XL
XH = 0.2                           # handle staples at +-XH
HINGE = np.array((0.0, HB, -D2))
G_BASE, G_LID, G_TAG, G_TONGUE, G_LEVER, G_IN = 0, 1, 2, 3, 7, 9
SC_SIZE = (136, 92)                # closed frames
SC_TALL = (136, 128)               # open / close frames (same width, same ground line)
SC_SCALE = 46.0
SC_GROUND = 60                     # pixel row of the ground under the case's centre (closed canvas)
VIEW = dict(yaw=0.52, pitch=0.68)


def _edge_pipes(R, yc, rnd, top=True, bottom=True, mat=None):
    """Welted edges round a rounded box (half extents L2, ., D2)."""
    o = (rnd - 0.014) * 0.7071
    ys = []
    if top:
        ys.append((yc[1] - rnd + o, +1))
    if bottom:
        ys.append((yc[0] + rnd - o, -1))
    for y, _ in ys:
        for sz in (-1, 1):
            z = sz * (D2 - rnd + o)
            R.cap((-L2 + rnd, y, z), (L2 - rnd, y, z), 0.021, mat=mat)
        for sx in (-1, 1):
            x = sx * (L2 - rnd + o)
            R.cap((x, y, -D2 + rnd), (x, y, D2 - rnd), 0.021, mat=mat)


def _corner_caps(R, y_lo, y_hi, rnd, which, mat=M_BRASS):
    """Brass corner caps: the rounded corner inflated a hair."""
    r = rnd + 0.011
    h = r + 0.018
    for sx in (-1, 1):
        for sz in (-1, 1):
            if (sx, sz) in which.get('skip', ()):
                continue
            for top in which['tops']:
                yc = (y_hi - rnd) if top else (y_lo + rnd)
                cc = (sx * (L2 - rnd), yc, sz * (D2 - rnd))
                c = (cc[0] - sx * (h - r), cc[1] - (1 if top else -1) * (h - r), cc[2] - sz * (h - r))
                R.box(c, (h, h, h), round=r, mat=mat)


def tongue_frames(pose, lid_R, lid_t):
    """Where each strap tongue hangs: [(R, t, length) per segment], per strap."""
    out = []
    for k, sx in enumerate((-1, 1)):
        a_loc = np.array((sx * XS, HB + 0.012, D2 + 2 * TS - 0.002))
        A = lid_R @ a_loc + lid_t
        ph = pose['tongue'][k]                 # (phi1, phi2, psi) or None when buckled
        segs = []
        if ph is None:
            segs.append((np.eye(3), A, 0.135))
            segs.append((np.eye(3), A + np.array((0, -0.135, 0)), 0.13))
        else:
            p1, p2, psi = ph
            R1 = rot_z(psi * sx) @ rot_x(-p1)
            R2 = rot_z(psi * sx * 1.4) @ rot_x(-p2)
            segs.append((R1, A, 0.135))
            segs.append((R2, A + R1 @ np.array((0, -0.135, 0)), 0.13))
        out.append(segs)
    return out


def suitcase_rig(pose, variant):
    """pose: theta (lid, rad), tongue [L, R], lever [aL, aR], prong [L, R],
    tag (swing, twist), puff (contents spring up), contents (bool)."""
    vr = SC_VARIANTS[variant]
    th = pose.get('theta', 0.0)
    R = Rig()
    hide = M_HIDEW if vr['faded'] else M_HIDE
    pipe = M_PIPEW if vr['faded'] else M_PIPE
    brass = M_TARN if vr['tarnish'] else M_BRASS
    # ---- base shell, its strap bands, then its hollow
    # straps first: each band is a rounded box hugging the case's rounded edges, wide in x,
    # with its sides cut flat before anything else is added (a cut carves all that came before)
    Rl = rot_x(-th)
    tl = HINGE - Rl @ HINGE
    for sx in (-1, 1):
        if vr['rope'] and sx > 0:
            continue
        x = sx * XS
        R.group(G_LID, Rl, tl)
        r = RL + TS
        R.box((x, (HB + HT + TS) / 2, 0), (SW / 2 + r, (HT + TS - HB) / 2, D2 + TS), round=r, mat=M_STRAP)
        for e in (-1, 1):
            R.box((x + e * (SW / 2 + 0.3), HT / 2 + 0.2, 0), (0.3, HT / 2 + 0.3, D2 + 0.3), mat=M_STRAP, op=1)
        R.group(G_BASE)
        r = RB + TS
        R.box((x, (YBK - TS) / 2, 0), (SW / 2 + r, (YBK + TS) / 2, D2 + TS), round=r, mat=M_STRAP)
        R.box((x, (YBK + HB) / 2, -D2 + 0.15), (SW / 2 + 0.05, (HB - YBK) / 2, 0.15 + TS), round=0.012, mat=M_STRAP)
        for e in (-1, 1):
            R.box((x + e * (SW / 2 + 0.3), HB / 2 - 0.1, 0), (0.3, HB / 2 + 0.1 - 0.002, D2 + 0.3), mat=M_STRAP, op=1)
    # ---- base shell and its hollow
    R.group(G_BASE)
    R.box((0, HB / 2, 0), (L2, HB / 2, D2), round=RB, mat=hide)
    R.box((0, (FLOOR + HB + 0.06) / 2, 0), (L2 - WALL, (HB + 0.06 - FLOOR) / 2, D2 - WALL), round=0.03,
          mat=M_LINING, op=1)
    # ---- the lid, hinged at the back edge
    R.group(G_LID, Rl, tl)
    R.box((0, HB + HL / 2, 0), (L2, HL / 2, D2), round=RL, mat=hide)
    R.ell((0, HT - 0.125, 0), (L2 - 0.16, 0.14, D2 - 0.14), k=0.07, mat=hide)        # a gently domed top
    R.box((0, (HB - 0.06 + HT - WALL) / 2, 0), (L2 - WALL, (HT - WALL - HB + 0.06) / 2, D2 - WALL), round=0.03,
          mat=M_LINING, op=1)
    # lid trim: piping, caps, catches, hinge plates, the pocket inside
    _edge_pipes(R, (HB, HT), RL, mat=pipe)
    _corner_caps(R, HB, HT, RL, dict(tops=(True,), skip=((1, 1),) if vr['patched'] else ()), mat=brass)
    for sx in (-1, 1):
        R.box((sx * XL, HB + 0.052, D2 + 0.006), (0.05, 0.036, 0.009), round=0.008, mat=brass)
        R.box((sx * 0.5, HB + 0.06, -D2 - 0.006), (0.075, 0.05, 0.009), round=0.008, mat=brass)
    R.box((0, HT - WALL - 0.014, 0.17), (0.74, 0.016, 0.3), round=0.014, mat=M_POCKET)
    if vr['peel']:                                          # the torn half of the torii label, curled up
        px_ = TORII[0] - 12.5 / SC_SCALE + 14 / SC_SCALE
        R.box((px_ + 0.05 * math.cos(0.9), HT + 0.012 + 0.05 * math.sin(0.9), TORII[1] + 0.01), (0.05, 0.003, 0.15),
              rot=rot_z(0.9) @ rot_x(0.08), round=0.002, mat=M_CARD)
        R.box((px_ + 0.1 * math.cos(0.9) + 0.025 * math.cos(1.6), HT + 0.012 + 0.1 * math.sin(0.9) + 0.025 *
               math.sin(1.6), TORII[1] + 0.01), (0.026, 0.003, 0.14), rot=rot_z(1.6), round=0.002, mat=M_CARD)
    if vr['patched']:                                       # a leather patch sewn over the broken corner
        R.box((L2 - 0.09, HT - 0.08, D2 - 0.09), (0.11, 0.09, 0.11), round=RL + 0.008, mat=M_PATCH)
    # ---- base trim
    R.group(G_BASE)
    _edge_pipes(R, (0, HB), RB, mat=pipe)
    _corner_caps(R, 0, HB, RB, dict(tops=(False,)), mat=brass)
    for sx in (-1, 1):
        R.cap((sx * 0.5 - 0.075, HB, -D2 - 0.012), (sx * 0.5 + 0.075, HB, -D2 - 0.012), 0.021, mat=brass)
        R.box((sx * 0.5, HB - 0.06, -D2 - 0.006), (0.075, 0.05, 0.009), round=0.008, mat=brass)
        R.box((sx * XL, HB - 0.07, D2 + 0.008), (0.062, 0.058, 0.011), round=0.012, mat=brass)
    # buckles on the base bands
    for k, sx in enumerate((-1, 1)):
        x = sx * XS
        bm = M_STEEL if (vr['oddbuckle'] and sx < 0) else brass
        if vr['rope'] and sx > 0:
            continue
        zf = D2 + 2 * TS + 0.012
        hw, hh = 0.078, 0.05
        R.cap((x - hw, YBK + hh, zf), (x + hw, YBK + hh, zf), 0.013, mat=bm)
        R.cap((x - hw, YBK - hh, zf), (x + hw, YBK - hh, zf), 0.013, mat=bm)
        R.cap((x - hw, YBK - hh, zf), (x - hw, YBK + hh, zf), 0.013, mat=bm)
        R.cap((x + hw, YBK - hh, zf), (x + hw, YBK + hh, zf), 0.013, mat=bm)
        pr = pose.get('prong', (0.0, 0.0))[k]
        pd = np.array((0, math.cos(pr), math.sin(pr)))
        p0 = np.array((x, YBK - hh, zf))
        R.cap(tuple(p0), tuple(p0 + pd * (2 * hh + 0.004)), 0.0105, mat=bm)
        R.box((x, YBK - 0.095, D2 + TS + 0.008), (SW / 2 + 0.012, 0.017, 0.012), round=0.008, mat=M_STRAP)
    # latch levers: pivot at the bottom, the top hooks the lid's catch; pop = swing outward
    for k, sx in enumerate((-1, 1)):
        a = pose.get('lever', (0.0, 0.0))[k]
        piv = np.array((sx * XL, HB - 0.115, D2 + 0.026))
        R.group(G_LEVER + k, rot_x(a), piv)
        R.box((0, 0.1, 0), (0.038, 0.1, 0.011), round=0.012, mat=brass)
        R.box((0, 0.185, 0.006), (0.03, 0.022, 0.012), round=0.01, mat=brass)
    # strap tongues (from the lid band down through the buckle, or flicked loose)
    R.group(G_BASE)
    for k, segs in enumerate(tongue_frames(pose, Rl, tl)):
        if vr['rope'] and k == 1:
            continue
        for j, (Rs, ts_, ln) in enumerate(segs):
            R.group(G_TONGUE + 2 * k + j, Rs, ts_)
            R.box((0, -ln / 2, 0), (SW / 2 - 0.006, ln / 2 + 0.012, TS / 2 + 0.002), round=0.008, mat=M_STRAP)
            if j == 1:
                R.ell((0, -ln, 0), (SW / 2 - 0.006, 0.055, TS / 2 + 0.002), mat=M_STRAP)
    # the handle: brass staples on the front, a stitched leather grip hanging against the case
    R.group(G_BASE)
    for sx in (-1, 1):
        x = sx * XH
        R.box((x, HB - 0.06, D2 + 0.006), (0.034, 0.042, 0.008), round=0.008, mat=brass)
        R.cap((x, HB - 0.035, D2 + 0.01), (x, HB - 0.035, D2 + 0.05), 0.011, mat=brass)
        R.cap((x, HB - 0.035, D2 + 0.05), (x, HB - 0.095, D2 + 0.05), 0.011, mat=brass)
        R.cap((x, HB - 0.095, D2 + 0.05), (x, HB - 0.095, D2 + 0.01), 0.011, mat=brass)
    hz = D2 + 0.058
    hy = HB - 0.2
    R.cap((-XH, HB - 0.07, D2 + 0.05), (-XH + 0.025, hy + 0.01, hz), 0.028, mat=hide)
    R.cap((XH, HB - 0.07, D2 + 0.05), (XH - 0.025, hy + 0.01, hz), 0.028, mat=hide)
    R.cap((-XH + 0.025, hy + 0.01, hz), (0.0, hy, hz + 0.01), 0.03, 0.042, k=0.03, mat=hide)
    R.cap((XH - 0.025, hy + 0.01, hz), (0.0, hy, hz + 0.01), 0.03, 0.042, k=0.03, mat=hide)
    if vr['rope']:
        _rope_strap(R, pose, Rl, tl)
    # ---- what is packed inside (only when it can be seen)
    if pose.get('contents', th > 0.02):
        pf = pose.get('puff', 0.0)
        R.group(G_IN)
        R.box((-0.46, 0.19 + 0.02 * pf, 0.0), (0.47, 0.135 + 0.02 * pf, 0.52), round=0.08, mat=M_AI)
        R.ell((-0.6, 0.31 + 0.03 * pf, -0.2), (0.3, 0.05, 0.25), k=0.06, mat=M_AI)
        R.box((0.43, 0.17 + 0.015 * pf, 0.27), (0.45, 0.12 + 0.015 * pf, 0.27), round=0.07, mat=M_CREAM)
        R.box((0.45, 0.235 + 0.03 * pf, -0.27), (0.3, 0.13 + 0.02 * pf, 0.22), round=0.1, mat=M_BENI)
        kn = np.array((0.45, 0.39 + 0.05 * pf, -0.25))
        R.ell(tuple(kn), (0.075, 0.055, 0.065), mat=M_BENI)
        R.cap(tuple(kn), tuple(kn + (-0.13, 0.08 + 0.02 * pf, 0.02)), 0.045, 0.022, k=0.02, mat=M_BENI)
        R.cap(tuple(kn), tuple(kn + (0.12, 0.09 + 0.02 * pf, -0.03)), 0.045, 0.022, k=0.02, mat=M_BENI)
        R.cap((-0.1, 0.33 + 0.02 * pf, 0.42), (0.12, 0.33 + 0.02 * pf, 0.4), 0.06, mat=M_CREAM)   # a rolled towel
    # ---- the luggage tag, swinging from the right staple
    sw, tw = pose.get('tag', (0.0, 0.0))
    top = np.array((XH, HB - 0.095, D2 + 0.052))
    Rt = rot_z(sw) @ rot_x(-0.1) @ rot_y(tw)
    hole = top + rot_z(sw * 0.6) @ np.array((0.085, -0.035, 0.03))
    R.group(G_BASE)
    R.cap(tuple(top), tuple(hole + (0, 0.012, 0)), 0.0075, mat=M_STRING)
    R.group(G_TAG, Rt, hole)
    R.box((0, -0.11, 0), (0.05, 0.105, 0.006), round=0.006, mat=M_CARD)
    for s in (-1, 1):
        R.box((s * 0.06, 0.005, 0), (0.03, 0.03, 0.03), rot=rot_z(math.pi / 4), mat=M_CARD, op=1)
    return R


def _rope_strap(R, pose, Rl, tl):
    """Repaired: hemp rope knotted round the case where the right strap
    broke; the part over the lid rides up with it when it opens."""
    x = XS + 0.02
    R.group(G_LID, Rl, tl)
    pts = [(-D2 - 0.03, HB + 0.01), (-D2 + 0.02, HT + 0.025), (0, HT + 0.03), (D2 - 0.02, HT + 0.025),
           (D2 + 0.03, HB + 0.03)]
    for (z0, y0), (z1, y1) in zip(pts[:-1], pts[1:]):
        R.cap((x, y0, z0), (x, y1, z1), 0.026, mat=M_ROPE)
    kn = (x, HB + 0.02, D2 + 0.055)
    R.ell(kn, (0.052, 0.04, 0.035), mat=M_ROPE)
    R.group(G_BASE)
    pts = [(-D2 - 0.03, HB), (-D2 - 0.03, 0.05), (-D2 + 0.05, -0.025), (D2 - 0.05, -0.025), (D2 + 0.03, 0.05),
           (D2 + 0.03, HB - 0.03)]
    for (z0, y0), (z1, y1) in zip(pts[:-1], pts[1:]):
        R.cap((x, y0, z0), (x, y1, z1), 0.026, mat=M_ROPE)
    if pose.get('theta', 0.0) < 0.05 and not any(pose.get('tongue', [None, None])):
        R.cap((x, HB - 0.03, D2 + 0.03), (x, HB + 0.005, D2 + 0.05), 0.024, mat=M_ROPE)
    R.cap((x, HB - 0.03, D2 + 0.03), (x + 0.05, HB - 0.15, D2 + 0.06), 0.018, 0.014, mat=M_ROPE)
    R.cap((x, HB - 0.03, D2 + 0.03), (x - 0.03, HB - 0.13, D2 + 0.065), 0.018, 0.014, mat=M_ROPE)


SC_VARIANTS = {
    'clean':    dict(name='clean', faded=False, tarnish=False, wear=0.15, cracks=0, peel=0, dirt=0.0, stains=0, rope=False,
                     patched=False, oddbuckle=False, tape=False, split=False, polish=True),
    'worn':     dict(name='worn', faded=True, tarnish=True, wear=1.0, cracks=1, peel=1, dirt=0.15, stains=0, rope=False,
                     patched=False, oddbuckle=False, tape=False, split=False, polish=False),
    'dirty':    dict(name='dirty', faded=False, tarnish=True, wear=0.5, cracks=0, peel=0, dirt=1.0, stains=1, rope=False,
                     patched=False, oddbuckle=False, tape=False, split=False, polish=False),
    'repaired': dict(name='repaired', faded=True, tarnish=False, wear=0.6, cracks=0, peel=0, dirt=0.2, stains=0, rope=True,
                     patched=True, oddbuckle=True, tape=True, split=True, polish=False),
}


def _metal_rims(F, mats=(M_BRASS, M_TARN, M_STEEL)):
    """Hardware gets a darker rim where it sits on something else, so small
    brass parts read as separate pieces."""
    met = F.hit & np.isin(F.mid, mats)
    other = F.hit & ~met
    nb = np.zeros(met.shape, bool)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        nb |= _shift(other, dy, dx, False)
    rim = met & nb
    F.idx[rim] = np.maximum(0, np.minimum(F.idx[rim] - 1, 2))


def _edge_near(F, d):
    """Pixels of the case within d of two of its box's faces (edges, corners)."""
    q = F.q
    out = np.zeros(F.hit.shape, bool)
    for gid, (y0, y1) in ((G_BASE, (0.0, HB)), (G_LID, (HB, HT))):
        s = F.gid == gid
        nx = (L2 - np.abs(q[..., 0])) < d
        nz = (D2 - np.abs(q[..., 2])) < d
        ny = (np.minimum(q[..., 1] - y0, y1 - q[..., 1])) < d
        out |= s & ((nx.astype(int) + nz + ny) >= 2)
    return out


def _light_delta(F, vn_top=0.92, vn_side=0.66, step=0.15):
    """Tone shift for decals: how much lighter/darker than the face they were drawn for."""
    up = np.abs(F.nq[..., 1]) > 0.7
    vn = np.where(up, vn_top, vn_side)
    return np.clip(np.round((F.v - vn) / step), -3, 1).astype(int)


def _paint_stitch(F, gid, pts, mats, period=0.05, duty=0.55, tone='lug_thread', di=0, phase=0.0):
    def fn(ys, xs):
        sel = np.zeros(F.hit.shape, bool)
        sel[ys, xs] = True
        F.colour(sel, tone, di=di - 2)
    F.line3d(gid, pts, fn, dash=(period, duty), dash_phase=phase, mats=mats)


def render_suitcase(pose, variant='clean', yaw=None, pitch=None, size=None, ground=None, squash=(1, 1, 1),
                    ret_frame=False):
    vr = SC_VARIANTS[variant]
    yaw = VIEW['yaw'] if yaw is None else yaw
    pitch = VIEW['pitch'] if pitch is None else pitch
    size = size or SC_SIZE
    ground = ground or (size[1] - (SC_SIZE[1] - SC_GROUND))
    R = suitcase_rig(pose, variant)
    F = Frame(R, size, SC_SCALE, (size[0] / 2, ground), yaw, pitch, squash=squash, bound=2.4)
    F.band()
    hide_m = [M_HIDE, M_HIDEW]
    q, nq = F.q, F.nq
    case = F.sel([G_BASE, G_LID], hide_m)
    # -- leather: a little grain, rubbed paler on the edges and corners, dark in the seams
    if vr['wear'] > 0.3:
        grain = case & (fbm(q, 16.0, 3) > 0.8 - 0.08 * vr['wear']) & (F.idx >= 2)
        F.idx[grain] -= 1
    near = _edge_near(F, 0.085)
    pipes = F.sel([G_BASE, G_LID], [M_PIPE, M_PIPEW])
    if vr['wear'] > 0.3:
        rub = (pipes | (case & _edge_near(F, 0.05))) & (fbm(q, 4.5, 5) > 0.74 - 0.2 * vr['wear'])
        F.idx[rub] += 1
        F.colour(rub & pipes & (fbm(q, 7.0, 6) > 0.6), 'lug_hidew', di=1)
    if vr['polish']:                                       # polished: a soft sheen across the dome
        sheen = case & (F.spec > 0.93) & (nq[..., 1] > 0.7) & ~near
        F.idx[sheen] += 1
    # -- stitching: round the lid top, along both sides of the seam, round the base bottom
    i = 0.075
    lid_top = [(-L2 + i, HT + 0.004, -D2 + i), (L2 - i, HT + 0.004, -D2 + i), (L2 - i, HT + 0.004, D2 - i),
               (-L2 + i, HT + 0.004, D2 - i), (-L2 + i, HT + 0.004, -D2 + i)]
    _paint_stitch(F, G_LID, lid_top, hide_m)
    # -- straps: stitched both edges, a darker groove down the middle of the tongue
    for gid in (G_BASE, G_LID):
        for sx in (-1, 1):
            for e in (-1, 1):
                x = sx * XS + e * (SW / 2 - 0.022)
                if gid == G_LID:
                    path = [(x, HT + TS + 0.001, D2 - 0.06), (x, HT + TS + 0.001, -D2 + 0.06)]
                else:
                    path = [(x, -TS - 0.001, D2 - 0.06), (x, -TS - 0.001, -D2 + 0.06)]
                _paint_stitch(F, gid, path, [M_STRAP], period=0.05, tone='lug_strap', di=3)
    for k in range(2):
        for j in range(2):
            gid = G_TONGUE + 2 * k + j
            ln = 0.135 if j == 0 else 0.13
            if j == 1:                                     # punched holes
                for hy in (-0.03, -0.075):
                    s = F.sel(gid, M_STRAP) & (np.hypot(q[..., 0], q[..., 1] - hy) < 0.014) & (q[..., 2] > 0)
                    F.colour(s, 'lug_strap', idx=0)
    # -- brass: rivets on the caps, keyholes on the latches
    brass = F.sel(None, [M_BRASS, M_TARN, M_STEEL])
    _metal_rims(F)
    for gid in (G_BASE, G_LID):
        ylo, yhi = (0, HB) if gid == G_BASE else (HB, HT)
        yc, ye = (yhi - 0.08, yhi + 0.011) if gid == G_LID else (ylo + 0.08, ylo - 0.011)
        for sx in (-1, 1):
            for sz in (-1, 1):
                for p in ((sx * (L2 - 0.08), yc, sz * (D2 + 0.011)), (sx * (L2 + 0.011), yc, sz * (D2 - 0.08)),
                          (sx * (L2 - 0.08), ye, sz * (D2 - 0.08))):
                    d = np.linalg.norm(q - np.array(p), axis=-1)
                    s = brass & (F.gid == gid) & (d < 0.019)
                    F.idx[s] = np.minimum(F.idx[s], 1)
    for k, sx in enumerate((-1, 1)):
        s = F.sel(G_BASE, [M_BRASS, M_TARN]) & (np.abs(q[..., 0] - sx * XL) < 0.012) & \
            (np.abs(q[..., 1] - (HB - 0.06)) < 0.025) & (q[..., 2] > D2 + 0.015)
        F.idx[s] = 0
        s = F.sel(G_LEVER + k) & (np.abs(q[..., 0]) < 0.011) & (np.abs(q[..., 1] - 0.09) < 0.02) & (q[..., 2] > 0.008)
        F.idx[s] = 0
    # -- the lining: a fine woven stripe; the pocket's gathered elastic edge
    lin = F.sel(None, [M_LINING])
    st = lin & (np.mod(q[..., 0] * 9.0, 1.0) < 0.18)
    F.idx[st] -= 1
    pk = F.sel(G_LID, M_POCKET)
    F.idx[pk & (np.mod(q[..., 0] * 11.0, 1.0) < 0.3) & (q[..., 2] < -0.08)] -= 1
    F.idx[pk & (q[..., 2] < -0.1)] += 1
    # -- packed clothes: kasuri crosses on the indigo, a white collar, the furoshiki's white pattern
    ai = F.sel(G_IN, M_AI)
    kx = (np.mod(q[..., 0] * 7.0 + np.floor(q[..., 2] * 7.0) * 0.5, 1.0) < 0.18) & (np.mod(q[..., 2] * 7.0, 1.0) < 0.3)
    F.colour(ai & kx & (nq[..., 1] > 0.5), 'lug_cream', di=-1)
    col = ai & (nq[..., 1] > 0.5) & (np.abs((q[..., 0] + 0.46) + 0.7 * (q[..., 2] - 0.1)) < 0.045)
    F.colour(col, 'lug_cream', di=0)
    be = F.sel(G_IN, M_BENI)
    dots = be & (np.hypot(np.mod(q[..., 0] * 9, 1) - 0.5, np.mod(q[..., 2] * 9 + q[..., 1] * 9, 1) - 0.5) < 0.2)
    F.colour(dots, 'lug_cream', di=0)
    cr = F.sel(G_IN, M_CREAM)
    F.idx[cr & (np.mod(q[..., 2] * 10.0, 1.0) < 0.2) & (nq[..., 1] > 0.5)] -= 1
    # -- stickers, then whatever the road did to it
    _paint_stickers(F, vr)
    _paint_variant(F, vr)
    # -- the tag: card both sides, a reinforced hole
    tg = F.sel(G_TAG, M_CARD)
    dl = _light_delta(F)
    F.decal(tg & (nq[..., 2] > 0), q[..., 0], -q[..., 1], tag_face(), 0.0, 0.11, 0.0122, delta=dl)
    F.decal(tg & (nq[..., 2] < 0), -q[..., 0], -q[..., 1], tag_face(True), 0.0, 0.11, 0.0122, delta=dl)
    hole = tg & (np.hypot(q[..., 0], q[..., 1] + 0.02) < 0.016)
    F.colour(hole, 'lug_brass', di=0)
    out = F.finish(inner=0.045)
    return (out, F) if ret_frame else out


def _paint_stickers(F, vr):
    q, nq = F.q, F.nq
    tex = 1.0 / SC_SCALE
    dl = _light_delta(F)
    leather = [M_HIDE, M_HIDEW]
    top = F.sel(G_LID, leather) & (nq[..., 1] > 0.6)
    lidfront = F.sel(G_LID, leather) & (nq[..., 2] > 0.7)
    base_r = F.sel(G_BASE, leather) & (nq[..., 0] > 0.7)
    lid_r = F.sel(G_LID, leather) & (nq[..., 0] > 0.7)
    base_l = F.sel(G_BASE, leather) & (nq[..., 0] < -0.7)
    back = F.sel([G_BASE, G_LID], leather) & (nq[..., 2] < -0.7)
    tu, tv = q[..., 0], q[..., 2]
    S = dict(clean=STICKERS, worn=STICKERS_WORN, dirty=STICKERS_DIRTY, repaired=STICKERS_REP)[vr['name']]
    F.decal(top, tu, tv, S['mountain'], -0.3, -0.22, tex, dl)
    if vr['peel']:                                         # the leather the label kept out of the sun
        ghost = F.decal(top, tu, tv, STICKERS['torii'], TORII[0], TORII[1], tex, mask_only=True)
        tore = ghost & (tu > TORII[0] - 12.5 * tex + 14 * tex)
        F.idx[tore] += 1
        F.colour(tore & (fbm(q, 30.0, 2) > 0.66), 'lug_card', di=-2)        # paper and glue left behind
    F.decal(top, tu, tv, S['torii'], TORII[0], TORII[1], tex, dl)
    F.decal(top, tu, tv, S['wave'], 0.28, -0.3, tex, dl)
    F.decal(top, tu, tv, S['teacup'], -0.3, 0.3, tex, dl)
    F.decal(top, tu, tv, S['station'], -0.8, -0.05, tex, dl)
    F.decal(lidfront, q[..., 0], -q[..., 1], S['name'], 0.0, -(HB + HL / 2 + 0.005), tex, dl)
    F.decal(base_r, -q[..., 2], -q[..., 1], S['boat'], 0.05, -0.2, tex, dl)
    F.decal(base_l, q[..., 2], -q[..., 1], S['maple'], -0.1, -0.19, tex, dl)
    F.decal(back, -q[..., 0], -q[..., 1], S['boat'], 0.0, -0.18, tex, dl)
    F.decal(lid_r, -q[..., 2], -q[..., 1], S['teacup'], -0.25, -(HB + HL / 2), tex, dl)


def _save_preview(frames, path, scale=4, bg=(46, 38, 46), cols=None):
    from PIL import Image
    frames = [f.a if hasattr(f, 'a') else f for f in frames]
    h = max(f.shape[0] for f in frames)
    w = max(f.shape[1] for f in frames)
    cols = cols or len(frames)
    rows = (len(frames) + cols - 1) // cols
    sheet = np.zeros((rows * (h + 2), cols * (w + 2), 3), np.uint8)
    sheet[:] = bg
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        y0, x0 = r * (h + 2) + (h - f.shape[0]), c * (w + 2)
        al = f[..., 3:4] / 255.0
        reg = sheet[y0:y0 + f.shape[0], x0:x0 + f.shape[1]]
        reg[:] = (f[..., :3] * al + reg * (1 - al)).astype(np.uint8)
    Image.fromarray(sheet).resize((sheet.shape[1] * scale, sheet.shape[0] * scale), Image.NEAREST).save(path)


# ================================================================ effects drawn over a frame
DUST = [RAMPS['lug_dust'][k] for k in range(4)]


def _put(a, x, y, c):
    h, w = a.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        a[y, x, :3] = c
        a[y, x, 3] = 255


def fx_puff(a, cx, cy, r, t, seed=0, ramp='lug_dust', drift=(0.0, -0.6), behind=None):
    """A dust puff at life t (0..1): a cluster of three soft balls that
    swells, rises a little, catches the light on its upper left, and is
    eaten away from one side until it is gone."""
    if t < 0 or t >= 1:
        return
    rng = np.random.RandomState(seed)
    cols = RAMPS[ramp]
    grow = 0.45 + 0.75 * (1 - (1 - t) ** 2.2)
    balls = [(0.0, 0.0, 1.0)]
    for k in range(2):
        ang = rng.uniform(0, TAU)
        balls.append((math.cos(ang) * 0.75, math.sin(ang) * 0.45, rng.uniform(0.55, 0.75)))
    ox, oy = drift[0] * r * t, drift[1] * r * t
    ba = rng.uniform(0, TAU)
    bite = (cx + ox + math.cos(ba) * r * 1.4, cy + oy + math.sin(ba) * r * 1.0)
    br = r * 2.1 * max(0.0, (t - 0.3) / 0.7) ** 0.9
    pts = {}
    for (bx, by, bs) in balls:
        rr = r * bs * grow
        x0, y0 = cx + ox + bx * r * grow, cy + oy + by * r * grow
        for y in range(int(y0 - rr) - 1, int(y0 + rr) + 2):
            for x in range(int(x0 - rr) - 1, int(x0 + rr) + 2):
                dx, dy = (x + 0.5 - x0) / rr, (y + 0.5 - y0) / (rr * 0.85)
                d = dx * dx + dy * dy
                if d > 1:
                    continue
                lit = -dx * 0.55 - dy * 0.85
                v = 2 if lit > 0.3 else (1 if lit > -0.45 else 0)
                pts[(x, y)] = max(pts.get((x, y), -1), v)
    for (x, y), v in pts.items():
        if math.hypot(x + 0.5 - bite[0], y + 0.5 - bite[1]) < br:
            continue
        if behind is not None and 0 <= y < behind.shape[0] and 0 <= x < behind.shape[1] and behind[y, x]:
            continue
        _put(a, x, y, cols[1 + v])


def fx_glint(a, x, y, s, ramp='lug_brass'):
    """A four-point star glint, size 1..3."""
    c = RAMPS[ramp]
    x, y = int(round(x)), int(round(y))
    if s <= 0:
        return
    _put(a, x, y, (255, 252, 236))
    for k in range(1, s + 1):
        cc = c[5] if k < s else c[4]
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            _put(a, x + dx, y + dy, cc)
    if s >= 3:
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            _put(a, x + dx, y + dy, c[4])


def draw_fx(a, F, fx):
    """fx: list of ('puff', p_obj, r_px, t, seed) / ('glint', p_obj, size)."""
    zb = np.where(F.hit, F.g['z'], -1e9)
    zpad = np.pad(zb, 1, constant_values=-1e9)
    zmax = np.max([zpad[1 + dy:1 + dy + zb.shape[0], 1 + dx:1 + dx + zb.shape[1]]
                   for dy in (-1, 0, 1) for dx in (-1, 0, 1)], axis=0)       # covers the outline too
    for e in fx:
        x, y, z = F.project(np.asarray(e[1], float))
        if e[0] == 'puff':
            fx_puff(a, float(x), float(y), e[2], e[3], e[4], behind=zmax > float(z) + 0.05)
        elif e[0] == 'glint':
            fx_glint(a, float(x), float(y), e[2])
    return a


# ================================================================ suitcase animation
def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def sc_frame(args):
    """Render one suitcase frame (top-level so a process pool can run it)."""
    pose, variant, size = args
    kw = {k: pose[k] for k in ('yaw', 'pitch', 'squash') if k in pose}
    a, F = render_suitcase(pose, variant, size=size, ret_frame=True, **kw)
    return draw_fx(a, F, pose.get('fx', []))


def _rest(**kw):
    p = dict(theta=0.0, tongue=[None, None], lever=(0.0, 0.0), prong=(0.0, 0.0), tag=(0.0, 0.0), puff=0.0)
    p.update(kw)
    return p


def sc_idle(n=24):
    out = []
    for k in range(n):
        ph = TAU * k / n
        fx = []
        if 13 <= k <= 16:                                       # a glint runs over the front-left cap
            fx.append(('glint', (-L2 + 0.02, HT - 0.03, D2 + 0.02), (1, 2, 3, 1)[k - 13]))
        out.append(_rest(tag=(0.19 * math.sin(ph), 0.4 * math.sin(ph - 1.0)), fx=fx))
    return out


def sc_turn(n=32):
    return [_rest(yaw=VIEW['yaw'] + TAU * k / n) for k in range(n)]


def _tongue_swing(t, amp, f=1.4, decay=0.45, ph=0.0):
    return amp * math.exp(-t / decay) * math.cos(TAU * f * t + ph)


def sc_open(variant='clean'):
    """Straps flick loose, the latches pop, the lid swings open past its
    stop and settles, the clothes inside breathe out, a puff of dust."""
    frames = []
    TH = [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.42, 0.95, 1.45, 1.86, 1.79, 1.69, 1.745, 1.725, 1.73, 1.73, 1.73, 1.73, 1.73,
          1.73, 1.73]
    SQ = {1: (1.025, 0.95), 2: (0.99, 1.03), 7: (1.02, 0.965), 8: (0.99, 1.02), 12: (1.01, 0.985)}
    # tongue (phi1, phi2) per frame: flick up and out, flop down, dangle
    TL = {2: (1.5, 2.6, 0.55), 3: (1.1, 1.3, 0.35), 4: (0.25, -0.05, -0.12), 5: (0.45, 0.55, 0.1), 6: (0.3, 0.3, 0.0),
          7: (0.32, 0.36, 0.02)}
    TR = {3: (1.5, 2.6, 0.55), 4: (1.1, 1.3, 0.35), 5: (0.25, -0.05, -0.12), 6: (0.45, 0.55, 0.1), 7: (0.3, 0.3, 0.0)}
    LV = {5: (1.3, 0), 6: (1.0, 1.3)}
    n = len(TH)
    for f in range(n):
        th = TH[f]
        fx = []
        tongue = []
        for k, tab in enumerate((TL, TR)):
            start = 2 + k
            if f < start:
                tongue.append(None)
            elif f in tab:
                tongue.append(tab[f])
            elif f < 8:
                tongue.append((0.31, 0.33, 0.02))
            else:                                               # hanging from the rising lid, trailing it
                t = (f - 9) / FPS
                sw = _tongue_swing(t, 0.75, 1.3, 0.5, 0.3 * k) if f >= 9 else 0.0
                lag = -0.35 if 9 <= f <= 11 else 0.0
                tongue.append((sw + lag, sw * 1.5 + lag * 1.3, 0.05 * math.sin(f * 1.7 + k)))
        if f < 5:
            lever = (0.0, 0.0)
        elif f in LV:
            lever = LV[f]
        else:
            lever = (1.0, 1.0)
        prong = tuple(0.0 if f < 2 + k else (0.9 if f == 2 + k else 0.55) for k in range(2))
        # glints as the latches pop
        for k, (f0, sx) in enumerate(((5, -1), (6, 1))):
            if f0 <= f <= f0 + 2:
                fx.append(('glint', (sx * XL, HB + 0.1, D2 + 0.12), (3, 2, 1)[f - f0]))
        for k, (f0, sx) in enumerate(((2, -1), (3, 1))):          # a little snap of dust at each buckle
            if sx > 0 and SC_VARIANTS[variant]['rope']:
                continue
            fx.append(('puff', (sx * XS + sx * 0.14, YBK + 0.04, D2 + 0.1), 2.6, (f - f0) / 5.0, 11 + k))
        if f >= 8:                                              # air pushed out of the seams as it opens
            for j, (x, z, vx, vz, r) in enumerate(((-L2 - 0.04, 0.25, -0.35, 0.05, 4.5), (L2 + 0.04, 0.1, 0.3, 0.0, 4.0),
                                                   (-0.7, D2 + 0.06, -0.15, 0.3, 5.0), (0.15, D2 + 0.08, 0.05, 0.35, 5.5),
                                                   (0.8, D2 + 0.06, 0.2, 0.3, 4.5), (-L2 - 0.03, -0.35, -0.3, -0.1, 3.5))):
                t = (f - 8 - (j % 3) * 0.6) / 8.0
                e = 1 - (1 - min(1.0, max(0.0, t))) ** 2
                fx.append(('puff', (x + vx * e, HB + 0.02 + 0.22 * e, z + vz * e), r, t, 30 + j))
        puff = 0.0 if f < 9 else max(0.0, math.exp(-(f - 10) / 3.0) * math.cos((f - 10) * 0.9)) * (1.0 if f >= 10 else 0.5)
        tag_sw = 0.0 if f < 8 else 0.22 * math.exp(-(f - 8) / 6.0) * math.sin((f - 8) * 1.1)
        sq = SQ.get(f, (1.0, 1.0))
        frames.append(dict(theta=th, tongue=tongue, lever=lever, prong=prong, tag=(tag_sw, tag_sw * 1.5), puff=puff,
                           contents=f >= 8, squash=(sq[0], sq[1], sq[0]), fx=fx))
    return frames


def sc_close(variant='clean'):
    """The lid drops, slams, bounces; dust bursts out along the floor; the
    straps slap down into their buckles and the latches click shut."""
    TH = [1.73, 1.86, 1.62, 1.08, 0.42, 0.0, 0.11, 0.0, 0.03, 0.0, 0.0, 0.0, 0.0, 0.0]
    SQ = {5: (1.045, 0.91), 6: (0.985, 1.035), 7: (1.02, 0.97), 8: (0.995, 1.01)}
    frames = []
    for f in range(len(TH)):
        th = TH[f]
        fx = []
        if f <= 4:
            t = f / FPS
            tg = [(0.15 - 0.4 * (f / 4) + 0.1 * math.sin(f * 1.3 + k), 0.2 - 0.5 * (f / 4), 0.03) for k in range(2)]
        elif f == 5:
            tg = [(0.9, 1.4, 0.06), (1.0, 1.5, 0.06)]
        elif f == 6:
            tg = [(0.35, 0.2, 0.02), (0.45, 0.35, 0.02)]
        elif f == 7:
            tg = [(0.06, -0.08, 0.0), (0.12, 0.0, 0.0)]
        else:
            tg = [None, None]
        lever = (1.0, 1.0) if f < 7 else ((0.35, 0.5) if f == 7 else (0.0, 0.0))
        prong = (0.55, 0.55) if f < 8 else (0.0, 0.0)
        if 8 <= f <= 10:
            for sx in (-1, 1):
                fx.append(('glint', (sx * XL, HB + 0.1, D2 + 0.06), (3, 2, 1)[f - 8] - (1 if sx > 0 and f == 8 else 0)))
        if f >= 5:                                              # dust bursts out under the slam
            t = (f - 5) / 7.4
            for j, (x, z, vx, vz) in enumerate(((-L2 - 0.05, 0.3, -0.6, 0.1), (L2 + 0.05, 0.2, 0.6, 0.1),
                                                (-0.6, D2 + 0.08, -0.2, 0.5), (0.5, D2 + 0.08, 0.25, 0.5),
                                                (-L2 - 0.02, -0.3, -0.5, -0.1), (0.0, D2 + 0.08, 0.0, 0.5))):
                e = 1 - (1 - t) ** 2
                fx.append(('puff', (x + vx * e, 0.06 + 0.1 * e, z + vz * e), 4.5 + (j % 3) * 0.8, t - 0.06 * (j % 2),
                           50 + j))
            if f <= 8:                                          # and from the seam
                t2 = (f - 5) / 4.0
                fx.append(('puff', (-0.3, HB + 0.03, D2 + 0.06 + 0.1 * t2), 3.2, t2, 61))
                fx.append(('puff', (0.75, HB + 0.03, D2 + 0.06 + 0.1 * t2), 3.2, t2, 62))
        tag_sw = 0.0 if f < 5 else 0.26 * math.exp(-(f - 5) / 2.6) * math.sin((f - 5) * 1.25)
        tw = tag_sw * 1.4 + sc_idle()[0]['tag'][1] * ease((f - 6) / 7.0)
        if f == len(TH) - 1:
            tag_sw, tw = sc_idle()[0]['tag']
        sq = SQ.get(f, (1.0, 1.0))
        frames.append(dict(theta=th, tongue=tg, lever=lever, prong=prong, tag=(tag_sw, tw), puff=0.0,
                           contents=th > 0.0, squash=(sq[0], sq[1], sq[0]), fx=fx))
    return frames


def _crack_paths(rng, n, region, length=(0.08, 0.2), y=HT + 0.006, seg=0.025):
    """Branching hairline cracks across a face (local x/z), as polylines."""
    (x0, x1), (z0, z1) = region
    out = []
    for _ in range(n):
        p = np.array((rng.uniform(x0, x1), rng.uniform(z0, z1)))
        a = rng.uniform(0, TAU)
        pts = [p.copy()]
        for i in range(int(rng.uniform(*length) / seg)):
            a += rng.uniform(-0.7, 0.7)
            p = p + seg * np.array((math.cos(a), math.sin(a) * 0.8))
            pts.append(p.copy())
            if rng.random() < 0.18 and i > 1:
                b = a + rng.choice((-1, 1)) * rng.uniform(0.8, 1.4)
                q = p.copy()
                br = [q.copy()]
                for _ in range(rng.randint(2, 4)):
                    q = q + seg * np.array((math.cos(b), math.sin(b) * 0.8))
                    br.append(q.copy())
                out.append([(u, y, v) for u, v in br])
        out.append([(u, y, v) for u, v in pts])
    return out


def _paint_variant(F, vr):
    q, nq = F.q, F.nq
    leather = [M_HIDE, M_HIDEW, M_PIPE, M_PIPEW]
    case = F.sel([G_BASE, G_LID], leather)
    top = F.sel(G_LID, leather) & (nq[..., 1] > 0.6)
    rng = np.random.RandomState(7)
    if vr['cracks']:
        # dried finish crazing: dark hairlines on the lid, pale scratches through the dye
        def dark(ys, xs):
            F.idx[ys, xs] = np.minimum(F.idx[ys, xs] - 2, 3)
            F.has[ys, xs] = False
        for path in _crack_paths(rng, 9, ((-0.55, 0.55), (-0.5, 0.5))):
            F.line3d(G_LID, path, dark, mats=leather, tol=0.06)
        def pale(ys, xs):
            F.idx[ys, xs] += 2
        for _ in range(7):
            x, z, a = rng.uniform(-0.8, 0.8), rng.uniform(-0.45, 0.5), rng.uniform(-0.6, 0.6)
            ln = rng.uniform(0.07, 0.16)
            F.line3d(G_LID, [(x, HT + 0.006, z), (x + ln * math.cos(a), HT + 0.006, z + ln * math.sin(a))], pale,
                     mats=leather, tol=0.06)
        # the front edge of the lid rubbed raw where hands grab it
        raw = F.sel(G_LID, leather) & (np.abs(q[..., 0]) < 0.75) & (q[..., 2] > D2 - 0.06) & \
            (q[..., 1] > HT - 0.07) & (fbm(q, 6.0, 12) > 0.5)
        F.colour(raw, 'lug_hidew', di=1)
    if vr['dirt'] > 0:
        # mud thrown up from the road on the bottom, splashes higher up, dust settled on top
        low = F.sel([G_BASE], leather + [M_STRAP]) | F.sel(G_BASE, [M_BRASS, M_TARN, M_STEEL])
        n = fbm(q + 3.0, 7.0, 21)
        height = 0.05 + 0.17 * vr['dirt'] * n
        mud = low & (q[..., 1] < height) & (nq[..., 1] < 0.5)
        if vr['dirt'] >= 1:
            for _ in range(26):
                sx = rng.choice((-1, 1))
                c = np.array((rng.uniform(-1.0, 1.0), rng.uniform(0.08, 0.3), D2 + 0.01))
                if rng.random() < 0.35:
                    c = np.array((sx * (L2 + 0.01), rng.uniform(0.06, 0.28), rng.uniform(-0.6, 0.6)))
                r = rng.uniform(0.012, 0.03)
                mud |= F.sel(G_BASE) & (np.linalg.norm(q - c, axis=-1) < r * 1.6) & (np.abs(nq[..., 1]) < 0.6)
        F.setmat(mud, M_MUD)
        F.has[mud] = False
        F.idx[mud] = np.clip(F.idx[mud] + (fbm(q, 22.0, 4)[mud] > 0.62) - (fbm(q, 14.0, 5)[mud] < 0.35), 0, 4)
        if vr['dirt'] >= 1:
            up = F.hit & (nq[..., 1] > 0.55) & ~np.isin(F.gid, [G_IN])
            dn = fbm(q, 5.0, 31) + 0.25 * np.clip(-q[..., 2] / D2, 0, 1) + 0.2 * (np.abs(q[..., 0]) > 0.75)
            dusty = up & (dn > 0.62)
            # someone wiped a hand across the lid: a clean streak through the dust
            wipe = np.abs((q[..., 0] + 0.1) * 0.35 - (q[..., 2] - 0.05)) < 0.07 + 0.03 * np.sin(q[..., 0] * 9)
            dusty &= ~wipe
            ys, xs = np.nonzero(dusty)
            heavy = (fbm(q, 11.0, 32) + 0.3 * dn)[ys, xs] > 0.95
            lv = np.clip(F.idx[ys, xs] - 1 + heavy, 0, 5)
            cols = np.array(RAMPS['lug_dusty'], np.uint8)[lv]
            stk = F.has[ys, xs]
            cols = np.where(stk[:, None] & ~heavy[:, None], step_arr(F.over[ys, xs], -1), cols)
            F.over[ys, xs] = cols
            F.has[ys, xs] = True
            # water stains: tide rings where rain pooled
            for (cx, cz, r) in ((-0.5, 0.2, 0.12), (0.45, -0.22, 0.09)):
                d = np.hypot(q[..., 0] - cx, (q[..., 2] - cz) * 1.1) * (0.85 + 0.3 * vnoise(q, 9.0, 3))
                ring = top & (np.abs(d - r) < 0.017)
                F.colour(ring, 'lug_dusty', di=-2)
            # grime in the seams and round the hardware
            gr = case & (F.g['ao'] < 0.8)
            F.idx[gr] -= 1
    if vr['tape']:
        # a tear across the lid, held shut with a strip of washi tape
        def tear(ys, xs):
            F.idx[ys, xs] = 0
            F.has[ys, xs] = False
        tpath = [(-0.66 + 0.04 * k, HT + 0.006, 0.42 - 0.05 * k + 0.025 * ((k * 7) % 3 - 1)) for k in range(12)]
        F.line3d(G_LID, tpath, tear, mats=leather, tol=0.06)
        u = (q[..., 0] + 0.45) * 0.8 + (q[..., 2] - 0.15) * 0.6
        v = -(q[..., 0] + 0.45) * 0.6 + (q[..., 2] - 0.15) * 0.8
        ragged = 0.012 * np.sign(np.sin(v * 140))
        band = top & (np.abs(u) < 0.085) & (np.abs(v) < 0.2 + ragged)
        F.colour(band, 'lug_tape', idx=np.clip(F.idx - 1, 0, 3))
        dots = band & (np.mod(v * 16, 1) < 0.34) & (np.abs(u) < 0.045)
        F.colour(dots, 'lug_beni', idx=np.clip(F.idx - 1, 2, 4))
        F.colour(band & (u > 0.062), 'lug_tape', idx=np.clip(F.idx - 3, 0, 3))
    if vr['split']:
        # a split in the base front, sewn up with cross stitches
        def gap(ys, xs):
            F.idx[ys, xs] = 0
        x0 = -0.8
        sp = [(x0 + 0.014 * math.sin(k * 1.9), HB - 0.06 - 0.022 * k, D2 + 0.002) for k in range(12)]
        F.line3d(G_BASE, sp, gap, mats=leather, tol=0.08)
        def thread(ys, xs):
            sel = np.zeros(F.hit.shape, bool)
            sel[ys, xs] = True
            F.colour(sel, 'lug_thread', di=-2)
            F.keep[ys, xs] = True
        for k in range(1, 11, 3):
            yk = HB - 0.06 - 0.022 * k
            for e in (-1, 1):
                F.line3d(G_BASE, [(x0 - 0.04, yk + 0.024 * e, D2 + 0.003), (x0 + 0.04, yk - 0.024 * e, D2 + 0.003)],
                         thread, mats=leather, tol=0.08)
    if vr['rope']:
        rp = F.sel([G_BASE, G_LID], M_ROPE)
        tw = np.mod((q[..., 1] * 1.0 + q[..., 2] * 0.35 + q[..., 0] * 0.6) * 26.0, 1.0)
        F.idx[rp & (tw < 0.3)] -= 1
        F.idx[rp & (tw > 0.85)] += 1
    if vr['patched']:
        pt = F.sel(G_LID, M_PATCH)
        e = pt & ((np.abs(q[..., 0] - (L2 - 0.17)) < 0.018) | (np.abs(q[..., 2] - (D2 - 0.17)) < 0.018) |
                  (np.abs(q[..., 1] - (HT - 0.16)) < 0.018))
        F.colour(e & (np.mod((q[..., 0] + q[..., 1] + q[..., 2]) * 22, 1) < 0.5), 'lug_thread', idx=2)
        F.keep |= e


# ================================================================ the travel bag
BAG_SIZE = (128, 116)
BAG_SCALE = 46.0
BAG_GROUND = 96
BAG_VIEW = dict(yaw=0.55, pitch=0.62)
G_BODY, G_RING, G_WHISK, G_CHARM, G_MAT = 0, 1, 3, 4, 5      # rings are G_RING + 0 (front), + 1 (back)
RING_R, RING_T = 0.31, 0.042
RINGS_SHUT = (-0.21, -0.22)
BAG_VARIANTS = {
    'clean':    dict(name='clean', faded=False, wear=0.0, dirt=0.0, hole=False, mended=False),
    'worn':     dict(name='worn', faded=True, wear=1.0, dirt=0.2, hole=True, mended=False),
    'dirty':    dict(name='dirty', faded=False, wear=0.4, dirt=1.0, hole=False, mended=False),
    'repaired': dict(name='repaired', faded=True, wear=0.5, dirt=0.15, hole=False, mended=True),
}


def _bag_body(S, sag=0.0, mat=M_BAG):
    """The soft body: a slumped pillow, flat underneath, drawn up to the rings."""
    S.ell((0, 0.43 - 0.04 * sag, 0), (0.84 + 0.03 * sag, 0.43 - 0.04 * sag, 0.52 + 0.025 * sag), mat=mat)
    S.box((0, 0.16, 0), (0.74 + 0.03 * sag, 0.16, 0.42 + 0.02 * sag), round=0.15, k=0.14, mat=mat)
    S.ell((0, 0.76 - 0.05 * sag, 0), (0.56, 0.24, 0.36), k=0.2, mat=mat)


MAT_R, MAT_LEN = 0.1, 0.92


def mat_axis(mr=0.0):
    """The rolled mat leans on the bag's right end: foot, axis, rotation."""
    Rm = rot_z(0.3 + mr) @ rot_x(-0.12)
    return np.array((0.92, 0.07, 0.12)), Rm @ np.array((0.0, 1.0, 0.0)), Rm


def ring_frame(k, a, sag=0.0):
    """Front (k=0) or back (k=1) ring: tilts by a (outward positive)."""
    sz = 1 if k == 0 else -1
    piv = np.array((0.0, 0.88 - 0.05 * sag, 0.17 * sz))
    return rot_x(a * sz), piv


def bag_rig(pose, variant):
    """pose: rings (aF, aB), mouth (0..1), whisk (lift, tilt), charm (swing, swing2),
    tie (1 tied .. 0 loose), sag, mat_rot."""
    vr = BAG_VARIANTS[variant]
    R = Rig()
    cloth = M_BAGW if vr['faded'] else M_BAG
    sag = pose.get('sag', 0.0)
    aF, aB = pose.get('rings', RINGS_SHUT)
    # the rolled straw mat strapped up the right end: first, so its flat ends can be cut
    R.group(G_MAT)
    mr = pose.get('mat_rot', 0.0)
    a0, ax, Rm = mat_axis(mr)
    a1 = a0 + ax * MAT_LEN
    R.cap(tuple(a0 - ax * 0.05), tuple(a1 + ax * 0.05), MAT_R, mat=M_STRAW)
    for e, p in ((-1, a0), (1, a1)):
        R.box(tuple(p + ax * (0.2 * e)), (0.3, 0.2, 0.3), rot=Rm, mat=M_STRAW, op=1)
    # body and the gathered cloth round each ring's foot
    R.group(G_BODY)
    _bag_body(R, sag, cloth)
    for k, a in enumerate((aF, aB)):
        Rr, piv = ring_frame(k, a, sag)
        R.group(G_RING + k, Rr, piv)
        for j in range(7):
            ang = math.radians(-155 + j * 21.7)
            c = (math.cos(ang) * RING_R * 0.92, RING_R - 0.04 + math.sin(ang) * RING_R * 0.92, 0.0)
            R.ell(c, (0.085, 0.075, 0.075), k=0.09, mat=cloth)
    # the mouth, when it opens
    R.group(G_BODY)
    o = pose.get('mouth', 0.0)
    if o > 0.03:
        R.ell((0, 0.92 - 0.05 * sag, 0.0), (0.42 * o + 0.02, 0.2, 0.24 * o + 0.02), mat=M_HOLE, op=1)
    # bamboo rings
    for k, a in enumerate((aF, aB)):
        Rr, piv = ring_frame(k, a, sag)
        R.group(G_RING + k, Rr, piv)
        n = 22
        for j in range(n):
            t0, t1 = TAU * j / n, TAU * (j + 1) / n
            p0 = (math.cos(t0) * RING_R, RING_R - 0.04 + math.sin(t0) * RING_R, 0.0)
            p1 = (math.cos(t1) * RING_R, RING_R - 0.04 + math.sin(t1) * RING_R, 0.0)
            R.cap(p0, p1, RING_T, mat=M_BAMBOO)
        if vr['mended'] and k == 1:                          # the cracked back ring, bound in twine
            for j in range(5):
                t = math.radians(28 + j * 5)
                c = (math.cos(t) * RING_R, RING_R - 0.04 + math.sin(t) * RING_R, 0.0)
                R.ell(c, (0.03, 0.03, 0.058), rot=rot_z(t), mat=M_TWINE)
    # toggle on the front ring's crown, cord loop from the back ring
    tie = pose.get('tie', 1.0)
    Rf, pf = ring_frame(0, aF, sag)
    Rb, pb = ring_frame(1, aB, sag)
    top_f = Rf @ np.array((0, 2 * RING_R - 0.04 + RING_T, 0)) + pf
    top_b = Rb @ np.array((0, 2 * RING_R - 0.04 + RING_T, 0)) + pb
    R.group(G_BODY)
    R.cap(tuple(top_f + (-0.07, 0.01, 0.0)), tuple(top_f + (0.07, 0.01, 0.0)), 0.026, mat=M_WOOD)
    if tie > 0.5:
        R.cap(tuple(top_b), tuple(top_f + (-0.03, 0.03, 0.02)), 0.014, mat=M_CORD)
        R.cap(tuple(top_b), tuple(top_f + (0.03, 0.03, 0.02)), 0.014, mat=M_CORD)
    else:
        lp = top_b + Rb @ np.array((0, -0.02, 0.12 * (1 if True else 0)))
        R.cap(tuple(top_b), tuple(lp + (-0.03, -0.06, 0)), 0.014, mat=M_CORD)
        R.cap(tuple(top_b), tuple(lp + (0.03, -0.06, 0)), 0.014, mat=M_CORD)
    # the tea whisk poking out between the gathers
    wl, wt = pose.get('whisk', (0.0, 0.0))
    Rw = rot_z(0.5 + wt) @ rot_x(0.12)
    R.group(G_WHISK, Rw, np.array((-0.36, 0.66 + wl - 0.05 * sag, 0.03)))
    R.cap((0, 0, 0), (0, 0.22, 0), 0.032, mat=M_BAMBOO)
    R.ell((0, 0.34, 0), (0.08, 0.135, 0.08), k=0.04, mat=M_TINE)
    # the gourd charm swinging from the front ring
    sw, sw2 = pose.get('charm', (0.0, 0.0))
    hang = Rf @ np.array((0.06, 2 * RING_R - 0.04 - RING_T, 0.0)) + pf
    Rc = rot_z(sw) @ rot_x(sw2)
    R.group(G_CHARM, Rc, hang)
    R.cap((0, 0, 0), (0, -0.13, 0), 0.011, mat=M_CORD)
    R.ell((0, -0.15, 0), (0.016, 0.014, 0.016), mat=M_CORD)
    R.ell((0, -0.2, 0), (0.044, 0.05, 0.044), mat=M_GOURD)
    R.ell((0, -0.29, 0), (0.064, 0.068, 0.064), k=0.03, mat=M_GOURD)
    for j in range(5):
        a = (j - 2) * 0.14 - sw * 0.6
        R.cap((0, -0.355, 0), (math.sin(a) * 0.1, -0.355 - math.cos(a) * 0.12, (j - 2) * 0.01), 0.014, 0.01,
              mat=M_CORD)
    R.group(G_BODY)
    # cords tying the mat on
    for yy in (0.25, 0.72):
        p = a0 + ax * yy
        R.cap(tuple(p + Rm @ np.array((-0.16, 0, 0.08))), tuple(p + Rm @ np.array((0.0, 0, MAT_R + 0.008))), 0.016,
              mat=M_CORD)
    return R


def _surface(arrs, origin, d, rmax=1.4):
    """Where a ray from inside the body leaves it (bisection on the field)."""
    from sculpt import _sdf
    o = np.asarray(origin, float)
    d = np.asarray(d, float) / np.linalg.norm(d)
    lo, hi = 0.0, rmax
    for _ in range(26):
        mid = (lo + hi) / 2
        if _sdf(*(o + d * mid), *arrs)[0] < 0:
            lo = mid
        else:
            hi = mid
    return o + d * (lo + hi) / 2


def bag_curve(arrs, ths, ys, lift=0.003):
    """Points on the body at azimuths ths and heights ys (lists)."""
    pts = []
    for th, y in zip(ths, ys):
        p = _surface(arrs, (0, y, 0), (math.sin(th) * 0.86, 0.0, math.cos(th) * 0.5))
        pts.append(p * (1 + lift))
    return pts


PATCHES = [  # (theta0, theta1, y0, y1, material, rows of sashiko)
    (-0.95, -0.3, 0.26, 0.62, M_KAKI, 2),
    (0.05, 0.75, 0.08, 0.36, M_ASAGI, 3),
    (0.55, 1.2, 0.44, 0.74, M_OCHRE, 0),
    (-0.2, 0.25, 0.56, 0.78, M_ASAGI, 0),
    (2.4, 3.1, 0.18, 0.58, M_KAKI, 3),
    (-2.5, -1.8, 0.1, 0.44, M_OCHRE, 2),
    (-1.6, -1.15, 0.5, 0.74, M_ASAGI, 0),
]
PATCHES_REP = [(-0.7, -0.35, 0.06, 0.24, M_OCHRE, 2), (1.5, 2.1, 0.15, 0.45, M_KAKI, 0)]


def render_bag(pose, variant='clean', yaw=None, pitch=None, size=None, ground=None, squash=(1, 1, 1), ret_frame=False):
    vr = BAG_VARIANTS[variant]
    yaw = BAG_VIEW['yaw'] if yaw is None else yaw
    pitch = BAG_VIEW['pitch'] if pitch is None else pitch
    size = size or BAG_SIZE
    ground = ground or BAG_GROUND
    lift = pose.get('lift', 0.0)
    R = bag_rig(pose, variant)
    F = Frame(R, size, BAG_SCALE, (size[0] / 2, ground - lift * BAG_SCALE), yaw, pitch, squash=squash, bound=2.2)
    F.band()
    q, nq = F.q, F.nq
    cloth_m = [M_BAG, M_BAGW]
    body = F.sel([G_BODY, G_RING, G_RING + 1], cloth_m)
    th = np.arctan2(q[..., 0] / 0.86, q[..., 2] / 0.5)
    yv = q[..., 1]
    # patches: other cloths sewn over the indigo, edges a little uneven
    patches = PATCHES + (PATCHES_REP if vr['mended'] else [])
    bodyonly = F.sel(G_BODY, cloth_m)
    pm = np.zeros(F.hit.shape, bool)
    jit = (vnoise(q, 18.0, 4) - 0.5) * 0.05
    for (t0, t1, y0, y1, m, rows) in patches:
        inside = bodyonly & (th > t0 + jit) & (th < t1 - jit) & (yv > y0 + jit) & (yv < y1 - jit)
        F.setmat(inside, m)
        pm |= inside
    F.band()
    # kasuri: little white splashes woven into the indigo
    u = th * 0.68
    # stripes on the ochre patch, a check on the persimmon one
    oc = F.sel(G_BODY, M_OCHRE)
    F.idx[oc & (np.mod(yv * 22.0, 1.0) < 0.35)] -= 1
    kk = F.sel(G_BODY, M_KAKI)
    F.idx[kk & ((np.mod(u * 14.0, 1.0) < 0.25) ^ (np.mod(yv * 14.0, 1.0) < 0.25))] -= 1
    # folds running down from the gathers
    arrs = _body_arrays(pose, vr)
    def crease(ys, xs):
        F.idx[ys, xs] -= 1
    def glow(ys, xs):
        F.idx[ys, xs] += 1
    for k, (t0, dt) in enumerate(((-0.5, -0.12), (-0.18, -0.05), (0.2, 0.08), (0.48, 0.14), (2.7, 0.1), (3.4, -0.1),
                                  (-2.6, 0.1), (1.0, 0.1), (-1.0, -0.1))):
        ths = [t0 + dt * i / 8 for i in range(9)]
        ys = [0.86 - 0.04 * pose.get('sag', 0.0) - 0.05 * i for i in range(9)]
        F.line3d(G_BODY, bag_curve(arrs, ths, ys), crease, mats=cloth_m + [M_KAKI, M_ASAGI, M_OCHRE], tol=0.07)
    # sashiko: white running stitches round each patch and in rows across them, and round the base
    def stitch(ys, xs):
        sel = np.zeros(F.hit.shape, bool)
        sel[ys, xs] = True
        F.colour(sel, 'lug_cream', di=-1)
        F.keep[ys, xs] = True
    duty = 0.5 if vr['wear'] < 0.5 else 0.38
    allm = cloth_m + [M_KAKI, M_ASAGI, M_OCHRE]
    for (t0, t1, y0, y1, m, rows) in patches:
        e = 0.03
        border = ([t0 + e + (t1 - t0 - 2 * e) * i / 14 for i in range(15)] + [t1 - e] * 6 +
                  [t1 - e - (t1 - t0 - 2 * e) * i / 14 for i in range(15)] + [t0 + e] * 6)
        bys = ([y0 + e] * 15 + [y0 + e + (y1 - y0 - 2 * e) * i / 5 for i in range(6)] + [y1 - e] * 15 +
               [y1 - e - (y1 - y0 - 2 * e) * i / 5 for i in range(6)])
        F.line3d(G_BODY, bag_curve(arrs, border, bys), stitch, dash=(0.045, duty), mats=allm, tol=0.07)
        for r in range(rows):
            yr = y0 + (y1 - y0) * (r + 1) / (rows + 1)
            F.line3d(G_BODY, bag_curve(arrs, [t0 + 0.07 + (t1 - t0 - 0.14) * i / 10 for i in range(11)], [yr] * 11),
                     stitch, dash=(0.04, duty), dash_phase=0.5 * r, mats=allm, tol=0.07)
    def row(ys, xs):                                           # sashiko rows right round the body
        sel = np.zeros(F.hit.shape, bool)
        sel[ys, xs] = True
        sel &= ~pm
        F.colour(sel, 'lug_aiw' if vr['faded'] else 'lug_asagi', idx=np.clip(F.idx + 1, 2, 4))
        F.keep[sel] = True
    for k, yr in enumerate((0.09, 0.15, 0.27, 0.39, 0.51, 0.63)):
        ths = [-math.pi + TAU * i / 72 for i in range(73)]
        F.line3d(G_BODY, bag_curve(arrs, ths, [yr - 0.04 * pose.get('sag', 0.0) * (yr > 0.3)] * 73),
                 stitch if k < 2 else row, dash=(0.05, duty), dash_phase=0.5 * k, mats=allm, tol=0.07)
    # bamboo: nodes round the rings, a lit stripe
    for k in range(2):
        bm = F.sel(G_RING + k, M_BAMBOO)
        ang = np.arctan2(q[..., 1] - (RING_R - 0.04), q[..., 0])
        node = bm & (np.abs(np.mod(ang * 5.0 / TAU * 2, 1.0) - 0.5) < 0.05)
        F.idx[node] = np.minimum(F.idx[node], 1)
    wb = F.sel(G_WHISK, M_BAMBOO)
    F.idx[wb & (np.abs(q[..., 1] - 0.12) < 0.012)] = 1
    tn = F.sel(G_WHISK, M_TINE)
    F.idx[tn & (np.mod(np.arctan2(q[..., 0], q[..., 2]) * 4 / math.pi, 1.0) < 0.42) & (q[..., 1] < 0.44)] -= 2
    crown = tn & (np.abs(np.hypot(q[..., 0], q[..., 2]) - 0.03) < 0.014) & (q[..., 1] > 0.43)
    F.colour(crown, 'lug_ochre', idx=1)                        # the tips curled in at the crown
    F.idx[tn & (q[..., 1] < 0.25)] -= 1
    # the straw mat: woven along its length, its rolled end spiralling, red ties
    st = F.sel(G_MAT, M_STRAW)
    a0, _, Rm = mat_axis(pose.get('mat_rot', 0.0))
    ml = (F.q - a0) @ Rm                                       # mat-local: axis along y
    ang = np.arctan2(ml[..., 2], ml[..., 0])
    side = st & (np.abs(ml[..., 1] - MAT_LEN / 2) < MAT_LEN / 2 - 0.01)
    F.idx[side & (np.mod(ang * 12 / math.pi, 1.0) < 0.3)] -= 1
    F.idx[side & (np.mod(ml[..., 1] * 30.0, 1.0) < 0.12)] -= 1
    rr = np.hypot(ml[..., 0], ml[..., 2])
    endf = st & ~side
    F.idx[endf & (np.mod(rr * 34 + ang / TAU, 1.0) < 0.35)] -= 1
    F.idx[side & (np.abs(np.mod(ang + 0.6 - ml[..., 1] * 0.5, TAU) - math.pi) < 0.12)] -= 1    # the roll's edge
    for yy in (0.25, 0.72):
        band = st & (np.abs(ml[..., 1] - yy) < 0.025)
        F.setmat(band, M_CORD)
    F.band(F.sel(G_MAT, M_CORD))
    # gourd: a cinched waist, a tiny highlight; red cord twist
    gd = F.sel(G_CHARM, M_GOURD)
    F.idx[gd & (np.abs(q[..., 1] + 0.235) < 0.012)] -= 1
    hole = F.hit & (F.mid == M_HOLE)
    if hole.any():                                             # the cloth lip round the open mouth
        nb = np.zeros(hole.shape, bool)
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nb |= _shift(hole, dy, dx, False)
        lip = nb & ~hole & F.hit & np.isin(F.mid, cloth_m + [M_KAKI, M_ASAGI, M_OCHRE])
        F.idx[lip] += 2
        F.idx[hole & (F.g['ao'] < 0.75)] = 0
    _paint_bag_variant(F, vr, pose, arrs, th, yv, pm)
    out = F.finish(inner=0.05)
    return (out, F) if ret_frame else out


def _body_arrays(pose, vr):
    S = Shapes()
    _bag_body(S, pose.get('sag', 0.0))
    return S.arrays()


def _paint_bag_variant(F, vr, pose, arrs, th, yv, pm):
    q, nq = F.q, F.nq
    cloth = F.sel([G_BODY, G_RING, G_RING + 1], [M_BAG, M_BAGW, M_KAKI, M_ASAGI, M_OCHRE])
    if vr['wear'] > 0.5:
        bare = cloth & (fbm(q, 6.0, 41) > 0.68)                 # threadbare: the weave showing paler
        F.idx[bare] += 1
        bm = F.sel(None, M_BAMBOO)
        F.idx[bm & (fbm(q, 9.0, 42) > 0.6)] -= 1
    if vr['hole']:
        c = np.array((-0.2, 0.42, 0.0))
        p = _surface(arrs, (0, 0.42, 0), (math.sin(-0.2) * 0.86, 0, math.cos(-0.2) * 0.5))
        dv = q - p
        d = np.linalg.norm(dv, axis=-1) / 0.08 * (0.85 + 0.35 * vnoise(q, 30.0, 5))
        hole = cloth & (d < 1)
        F.colour(hole, 'lug_ai', idx=np.where(d < 0.6, 0, 1))          # the dark lining showing through
        threads = hole & ((np.abs(dv[..., 1] - 0.3 * dv[..., 0]) < 0.008) | (np.abs(dv[..., 1] + 0.02) < 0.007))
        F.colour(threads, 'lug_aiw', idx=4)                          # a few loose threads across it
        fray = cloth & (d >= 1) & (d < 1.5)
        F.idx[fray] += 2
        F.colour(fray & (vnoise(q, 60.0, 6) > 0.62), 'lug_aiw', idx=5)
    if vr['dirt'] > 0:
        low = F.sel([G_BODY], [M_BAG, M_BAGW, M_KAKI, M_ASAGI, M_OCHRE, M_STRAW])
        mud = low & (yv < 0.05 + 0.2 * vr['dirt'] * fbm(q + 2.0, 6.0, 51))
        if vr['dirt'] >= 1:
            rng = np.random.RandomState(52)
            for _ in range(22):
                t = rng.uniform(-1.6, 1.6)
                p = _surface(arrs, (0, rng.uniform(0.1, 0.4), 0), (math.sin(t) * 0.86, 0, math.cos(t) * 0.5))
                mud |= low & (np.linalg.norm(q - p, axis=-1) < rng.uniform(0.02, 0.045))
            up = F.hit & (nq[..., 1] > 0.6) & (fbm(q, 5.0, 53) > 0.5)
            ys, xs = np.nonzero(up)
            cols = np.array(RAMPS['lug_dust'], np.uint8)[np.clip(F.idx[ys, xs] - 1, 0, 3)]
            F.over[ys, xs] = cols
            F.has[ys, xs] = True
            for (t, yc, r) in ((0.35, 0.55, 0.09), (-0.9, 0.3, 0.07)):
                p = _surface(arrs, (0, yc, 0), (math.sin(t) * 0.86, 0, math.cos(t) * 0.5))
                dd = np.linalg.norm(q - p, axis=-1) * (0.85 + 0.3 * vnoise(q, 12.0, 6))
                F.colour(cloth & (np.abs(dd - r) < 0.014), 'lug_ochre', idx=1)
        F.setmat(mud, M_MUD)
        F.has[mud] = False
        F.idx[mud] = np.clip(F.idx[mud] + (fbm(q, 20.0, 54)[mud] > 0.6) - 1, 0, 4)
    if vr['mended']:
        # a darned tear: a grid of cream thread woven over it
        p = _surface(arrs, (0, 0.62, 0), (math.sin(0.55) * 0.86, 0, math.cos(0.55) * 0.5))
        d = q - p
        darn = cloth & (np.abs(d[..., 1]) < 0.075) & (np.linalg.norm(d, axis=-1) < 0.11)
        weft = np.mod(d[..., 1] * 42, 1.0) < 0.45
        warp = np.mod((d[..., 0] - d[..., 2]) * 36, 1.0) < 0.45
        F.colour(darn & (weft ^ warp), 'lug_cream', di=-1)
        F.colour(darn & ~(weft | warp), 'lug_ochre', di=-1)
        F.keep |= darn
        tw = F.sel(G_RING + 1, M_TWINE)
        F.idx[tw & (np.mod((q[..., 0] + q[..., 1]) * 60, 1.0) < 0.4)] -= 1


# ================================================================ bag animation
def bag_frame(args):
    pose, variant, size = args
    kw = {k: pose[k] for k in ('yaw', 'pitch', 'squash') if k in pose}
    a, F = render_bag(pose, variant, size=size, ret_frame=True, **kw)
    return draw_fx(a, F, pose.get('fx', []))


def _bag_rest(k=0, n=24, **kw):
    ph = TAU * k / n
    p = dict(sag=0.3 + 0.3 * math.sin(ph), rings=(RINGS_SHUT[0] + 0.025 * math.sin(ph + 0.6),
                                                     RINGS_SHUT[1] + 0.025 * math.sin(ph + 0.6)),
             charm=(0.16 * math.sin(2 * ph - 0.9), 0.08 * math.sin(2 * ph - 2.0)), tie=1.0, mouth=0.0,
             whisk=(0.012 * math.sin(ph + 0.4), 0.0))
    p.update(kw)
    return p


def bag_idle(n=24):
    """It slumps and fills a little, like something soft breathing; the
    gourd swings on its cord a beat behind."""
    return [_bag_rest(k, n) for k in range(n)]


def bag_turn(n=32):
    return [_bag_rest(0, yaw=BAG_VIEW['yaw'] + TAU * k / n) for k in range(n)]


def bag_open():
    """The rings squeeze, the toggle pops out of its loop, the rings fall
    apart past their rest and settle, the mouth gapes, the whisk jumps up
    and drops back in."""
    S0 = RINGS_SHUT
    RG = [S0, (S0[0] - 0.05, S0[1] - 0.05), (S0[0] - 0.09, S0[1] - 0.08), (0.1, 0.05), (0.45, 0.4), (0.72, 0.64),
          (0.58, 0.5), (0.47, 0.43), (0.53, 0.48), (0.5, 0.46)]
    MO = [0, 0, 0, 0.25, 0.65, 0.95, 1.0, 1.0]
    WK = [(0, 0), (0, 0), (-0.02, 0), (0.0, 0), (0.06, 0.04), (0.2, 0.12), (0.32, 0.2), (0.37, 0.24), (0.33, 0.18),
          (0.24, 0.06), (0.12, -0.08), (0.01, -0.06), (0.05, 0.02), (0.0, 0.0)]
    SG = [0.3, 0.12, 0.08, 0.2, 0.45, 0.55, 0.5, 0.42, 0.4]
    n = 22
    out = []
    for f in range(n):
        rings = RG[min(f, len(RG) - 1)]
        mouth = MO[min(f, len(MO) - 1)]
        wl, wt = WK[min(f, len(WK) - 1)]
        sag = SG[min(f, len(SG) - 1)]
        t = max(0, f - 2) / FPS
        cs = 0.0 if f < 2 else 0.5 * math.exp(-t / 0.7) * math.sin(TAU * 1.1 * t + 0.4)
        fx = []
        if f >= 3:
            fx.append(('puff', (0.0, 1.5, 0.05), 2.6, (f - 3) / 5.0, 71))
        if f >= 4:
            for j, (x, z) in enumerate(((-0.3, 0.05), (0.25, -0.02), (0.02, 0.1))):
                tt = (f - 4 - j * 0.7) / 8.0
                e = 1 - (1 - min(1.0, max(0.0, tt))) ** 2
                fx.append(('puff', (x * (1 + e), 1.0 + 0.35 * e, z), 3.2, tt, 72 + j))
        out.append(dict(rings=rings, mouth=mouth, whisk=(wl, wt), sag=sag, tie=1.0 if f < 3 else 0.0,
                        charm=(cs, 0.4 * cs), fx=fx))
    return out


def bag_drop():
    """Set down: it drops the last bit, lands squashed, the rings flop
    apart and fall back together, dust puffs out from under it."""
    LF = [0.42, 0.2, 0.0, 0.0, 0.025, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    SQ = [(0.94, 1.08), (0.95, 1.07), (1.13, 0.83), (1.06, 0.92), (0.97, 1.04), (1.02, 0.98), (0.995, 1.01),
          (1.0, 1.0), (1.0, 1.0), (1.0, 1.0), (1.0, 1.0), (1.0, 1.0)]
    S0 = RINGS_SHUT
    RG = [(S0[0] - 0.08, S0[1] - 0.08), (S0[0] - 0.12, S0[1] - 0.12), (0.12, 0.08), (0.24, 0.2), (0.04, 0.0),
          (-0.14, -0.15), (-0.27, -0.27), (-0.2, -0.21), (-0.22, -0.225)]
    SG = [0.0, 0.0, 0.7, 0.85, 0.45, 0.25, 0.32, 0.3, 0.3]
    rest = _bag_rest(0)
    out = []
    n = 12
    for f in range(n):
        sq = SQ[f]
        t = max(0, f - 2) / FPS
        if f < 2:
            cs = (0.0, -0.5 - 0.2 * f)
        else:
            a = 0.45 * math.exp(-t / 0.45) * math.cos(TAU * 1.2 * t)
            cs = (0.3 * a, a)
        if f == n - 1:
            cs = rest['charm']
        fx = []
        if f >= 2:
            for j, (x, z, vx, vz, r) in enumerate(((-0.8, 0.25, -0.25, 0.1, 4.5), (0.8, 0.3, 0.22, 0.1, 4.0),
                                                   (-0.35, 0.55, -0.15, 0.3, 4.5), (0.35, 0.55, 0.12, 0.3, 5.0),
                                                   (-0.65, -0.3, -0.2, -0.1, 3.5))):
                tt = (f - 2 - 0.4 * (j % 2)) / 8.0
                e = 1 - (1 - min(1.0, max(0.0, tt))) ** 2
                fx.append(('puff', (x + vx * e, 0.05 + 0.12 * e, z + vz * e), r, tt, 80 + j))
        out.append(dict(rest, lift=LF[f], squash=(sq[0], sq[1], sq[0]), rings=RG[min(f, len(RG) - 1)],
                        sag=SG[min(f, len(SG) - 1)], charm=cs, fx=fx))
    out[-1].update(rings=rest['rings'], sag=rest['sag'])
    return out


# ================================================================ build
SC_NOTE = ('3/4 view from slightly above, light from the upper left. All frames {0}x{2} (room above the case for the '
           'lid when it opens); the ground under the case is {3} px above the bottom edge (anchor bottom-centre). turn '
           'is a full 360 degree turn in {4} even steps (drag to rotate). The last frame of close equals the first '
           'frame of idle.')
BAG_NOTE = ('3/4 view from slightly above, light from the upper left. All frames {0}x{1}; the ground under the bag is '
            '{2} px above the bottom edge (anchor bottom-centre). turn is a full 360 degree turn in {3} even steps '
            '(drag to rotate). drop ends on the first frame of idle.')


def build(which=('suitcase', 'bag'), procs=3, variants=None):
    from multiprocessing import Pool
    jobs, plan = [], []
    if 'suitcase' in which:
        for v in (variants or SC_VARIANTS):
            anims = dict(idle=(sc_idle(), SC_TALL), turn=(sc_turn(), SC_TALL), open=(sc_open(v), SC_TALL))
            if v == 'clean':
                anims['close'] = (sc_close(v), SC_TALL)
            for an, (poses, size) in anims.items():
                plan.append(('suitcase_' + v, an, len(poses)))
                jobs += [('s', p, v, size) for p in poses]
    if 'bag' in which:
        for v in (variants or BAG_VARIANTS):
            anims = dict(idle=bag_idle(), turn=bag_turn())
            if v == 'clean':
                anims['open'] = bag_open()
            anims['drop'] = bag_drop()
            for an, poses in anims.items():
                plan.append(('travel_bag_' + v, an, len(poses)))
                jobs += [('b', p, v, BAG_SIZE) for p in poses]
    print(f'{len(jobs)} frames')
    with Pool(procs) as pool:
        frames = pool.map(_job, jobs, chunksize=2)
    k = 0
    out = {}
    for (name, an, n) in plan:
        out.setdefault(name, {})[an] = frames[k:k + n]
        k += n
    for name, anims in out.items():
        if name.startswith('suitcase'):
            note = SC_NOTE.format(SC_SIZE[0], SC_SIZE[1], SC_TALL[1], SC_SIZE[1] - SC_GROUND, len(anims['turn']))
        else:
            note = BAG_NOTE.format(BAG_SIZE[0], BAG_SIZE[1], BAG_SIZE[1] - BAG_GROUND, len(anims['turn']))
        path = export_prop(name, anims, fps=FPS, note=note)
        print('  ' + name + ': ' + ', '.join(f'{a} {len(f)}' for a, f in anims.items()) + '  -> ' + path)
    return out


def _job(j):
    kind, pose, v, size = j
    return sc_frame((pose, v, size)) if kind == 's' else bag_frame((pose, v, size))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    j = int(sys.argv[sys.argv.index('-j') + 1]) if '-j' in sys.argv else 3
    args = [a for a in args if not a.isdigit()]
    build(tuple(args) or ('suitcase', 'bag'), j)
