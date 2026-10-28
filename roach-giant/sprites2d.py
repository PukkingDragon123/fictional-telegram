"""The teahouse pack's own 2D pixel art, standing in the 3D valley (HD-2D).

The grove trees (black pines, cypresses, zelkovas, oaks, birches - with their
sixteen frames of sway), the meadow's grass tufts, flowers and pampas are
drawn as billboards: flat sprites that always face the camera, stood up in
the world at their place and size, depth-tested with everything else, lit by
the moon and shadowed by the giant. Each has a dead twin: leaves dried to
straw and brown, flowers to rust, bark to ash grey; and a flag on every leaf
pixel so a dying tree can drop its leaves in clumps.

Each sprite is kept at four sizes (each half the last, colours picked from
the pixels below, never blended), so a far tree is drawn near 1:1 and stays
crisp pixel art.
"""
import math
import os
import pickle
import random
import sys

import numpy as np
from numba import njit

import hd2d as K

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, '..', 'teahouse-assets', 'generator')
sys.path.insert(0, GEN)
sys.path.insert(0, os.path.join(HERE, '..', 'gaki-rampage'))
from pixel import PAL                                                         # noqa: E402

CACHE = os.path.join(HERE, '.cache', 'sprites.pkl')
SPRITE = 14
NAME_OF = {}
for _n, _v in PAL.items():
    NAME_OF.setdefault(tuple(_v), _n)
GREENS = ('leaf', 'jade', 'alien', 'teal', 'nleaf')
COLOURS = ('red', 'scarlet', 'pink', 'purp', 'lilac', 'gold', 'fire', 'blood', 'copper', 'sky', 'cloud', 'white')
WOODS = ('wood', 'bark', 'paper', 'hinoki')
DRY = ['ink', 'bark0', 'wood1', 'wood2', 'wood3', 'paper1', 'paper2']
RUST = ['ink', 'bark0', 'bark1', 'copper0', 'wood2']
ASH = ['ink', 'stone0', 'stone1', 'stone2', 'stone3', 'stone3']


def fam(name):
    return ''.join(c for c in name if not c.isdigit())


def lum(c):
    return (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255.0


def twin(a):
    """Dead twin of an RGBA sprite (RGB order), the leaf flags, the top-edge
    flags (where the sky's rim light falls)."""
    out = a.copy()
    solid = a[..., 3] > 0
    leaf = np.zeros(solid.shape, bool)
    flat = a[..., :3].reshape(-1, 3)
    for c in np.unique(flat[solid.ravel()], axis=0):
        t = tuple(int(v) for v in c)
        name = NAME_OF.get(t)
        f = fam(name) if name else None
        m = solid & (a[..., :3] == c).all(-1)
        L = lum(t)
        if f in GREENS or (f is None and t[1] > t[0] and t[1] > t[2]):
            ramp = DRY
            leaf |= m
        elif f in COLOURS:
            ramp = RUST
            leaf |= m
        elif f in WOODS or f is None:
            ramp = ASH
        else:
            continue
        k = min(len(ramp) - 1, int(L * len(ramp) * 1.1))
        out[m, :3] = PAL[ramp[k]]
    up = np.vstack([np.zeros((1, solid.shape[1]), bool), solid[:-1]])
    top = solid & ~up
    return out, leaf, top


def half(a, d, leaf, top):
    """Half size without blending: alpha by majority, colour of the pixel
    closest to the mean of the solid ones."""
    h, w = a.shape[:2]
    h2, w2 = h // 2, w // 2
    if h2 < 1 or w2 < 1:
        return None
    a = a[:h2 * 2, :w2 * 2]
    d = d[:h2 * 2, :w2 * 2]
    leaf = leaf[:h2 * 2, :w2 * 2]
    top = top[:h2 * 2, :w2 * 2]
    blk = lambda x: x.reshape(h2, 2, w2, 2, *x.shape[2:]).swapaxes(1, 2).reshape(h2, w2, 4, *x.shape[2:])
    A, D, Lf, T = blk(a), blk(d), blk(leaf), blk(top)
    sol = A[..., 3] > 0
    n = sol.sum(-1)
    mean = (A[..., :3].astype(float) * sol[..., None]).sum(2) / np.maximum(n, 1)[..., None]
    dist = ((A[..., :3].astype(float) - mean[:, :, None]) ** 2).sum(-1) + (~sol) * 1e9
    k = dist.argmin(-1)
    ii, jj = np.mgrid[0:h2, 0:w2]
    out = np.zeros((h2, w2, 4), np.uint8)
    out[..., :3] = A[ii, jj, k, :3]
    out[..., 3] = np.where(n >= 2, 255, 0)
    dd = D[ii, jj, k].copy()
    return out, dd, Lf[ii, jj, k] & (n >= 2), T.any(-1) & (n >= 2)


# ---------------------------------------------------------------- the library
TREE_KINDS = [  # name, grove fn, seeds, k, metres tall (roughly)
    ('cypress', 'cypress', (11, 31, 51), 0.9, 26.0),
    ('pine', 'black_pine', (12, 72, 82), 0.85, 17.0),
    ('zelkova', 'zelkova', (3, 23), 0.85, 19.0),
    ('oak', 'oak', (4, 24), 0.8, 16.0),
    ('birch', 'birch', (19,), 0.8, 15.0),
]
OLD_PINE = ('old_pine', 'black_pine', (907,), 1.25, 34.0)


def _frames_to_arrays(frames):
    return [np.asarray(f.a if hasattr(f, 'a') else f, np.uint8) for f in frames]


def build():
    if os.path.exists(CACHE):
        with open(CACHE, 'rb') as fh:
            return pickle.load(fh)
    import grove
    import meadow
    import sets as GSET
    lib = dict(trees=[], tufts=[], flowers=[], susuki=[])
    for (name, fn, seeds, k, Hm) in TREE_KINDS + [OLD_PINE]:
        for i, s in enumerate(seeds):
            frames, base = GSET.grown(getattr(grove, fn), s, k, 0.8, i * 1.3)
            arrs = _frames_to_arrays(frames)
            key = 'old_pine' if name == 'old_pine' else 'trees'
            entry = dict(kind=name, frames=arrs, base=base, Hm=Hm)
            if key == 'old_pine':
                lib['old_pine'] = entry
            else:
                lib['trees'].append(entry)
    rng = random.Random(5)
    for i in range(10):
        fr = meadow.tuft(rng, rng.randint(8, 18), rng.randint(5, 9), dark=rng.randint(0, 1))
        lib['tufts'].append(dict(kind='tuft', frames=_frames_to_arrays(fr), base=None, Hm=None))
    for kind in ('spider_lily', 'spider_lily', 'spider_lily', 'bellflower', 'cosmos_white', 'cosmos', 'daisy',
                 'marigold'):
        fr = meadow.flower_plant(rng, kind)
        lib['flowers'].append(dict(kind=kind, frames=_frames_to_arrays(fr), base=None, Hm=None))
    for i in range(4):
        fr = meadow.susuki(rng)
        lib['susuki'].append(dict(kind='susuki', frames=_frames_to_arrays(fr), base=None, Hm=None))
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, 'wb') as fh:
        pickle.dump(lib, fh, protocol=4)
    return lib


class Atlas:
    """Every frame of every sprite at four sizes, flattened for the kernel:
    alive colour, dead colour (BGR 0..1), flags (1 solid, 2 leaf, 4 top edge)."""

    def __init__(self):
        self.off, self.w, self.h = [], [], []
        self.A, self.D, self.Fl = [], [], []
        self.n = 0
        self.entries = {}

    def _push(self, a, d, leaf, top):
        h, w = a.shape[:2]
        self.off.append(self.n)
        self.w.append(w)
        self.h.append(h)
        self.A.append(a[..., 2::-1].reshape(-1, 3).astype(np.float32) / 255)
        self.D.append(d[..., 2::-1].reshape(-1, 3).astype(np.float32) / 255)
        fl = (a[..., 3] > 0).astype(np.uint8) | (leaf.astype(np.uint8) << 1) | (top.astype(np.uint8) << 2)
        self.Fl.append(fl.reshape(-1))
        self.n += h * w
        return len(self.off) - 1

    def finish(self):
        self.off = np.array(self.off, np.int64)
        self.w = np.array(self.w, np.int32)
        self.h = np.array(self.h, np.int32)
        self.A = np.concatenate(self.A)
        self.D = np.concatenate(self.D)
        self.Fl = np.concatenate(self.Fl)


# ---------------------------------------------------------------- drawing them
@njit(cache=True, fastmath=True)
def _sprites(R, focal, sx, sy, sz, scale, ang, bx, by, fid, dead, thin, poid, pvar, off, ws, hs, A, D, Fl,
             depth, nrm, mat, oid, var, att, aux, alb, nx, ny, nz):
    """Billboards: (sx, sy) the screen point of the sprite's base pixel (bx, by),
    `scale` screen pixels a texel, `ang` a tilt about the base (radians)."""
    Hd, Wd = depth.shape
    for i in range(sx.shape[0]):
        f = fid[i]
        w = ws[f]
        h = hs[f]
        o = off[f]
        s = scale[i]
        ca = math.cos(ang[i])
        sa = math.sin(ang[i])
        # the corners on screen, for the box
        xs = (0.0 - bx[i], w - bx[i], 0.0 - bx[i], w - bx[i])
        ys = (0.0 - by[i], 0.0 - by[i], h - by[i], h - by[i])
        x0 = 1e9
        x1 = -1e9
        y0 = 1e9
        y1 = -1e9
        for k in range(4):
            X = sx[i] + (xs[k] * ca - ys[k] * sa) * s
            Y = sy[i] + (xs[k] * sa + ys[k] * ca) * s
            x0 = min(x0, X)
            x1 = max(x1, X)
            y0 = min(y0, Y)
            y1 = max(y1, Y)
        ix0 = max(0, int(x0))
        ix1 = min(Wd - 1, int(x1) + 1)
        iy0 = max(0, int(y0))
        iy1 = min(Hd - 1, int(y1) + 1)
        z = sz[i]
        dd = dead[i]
        th = thin[i]
        for py in range(iy0, iy1 + 1):
            yc = -(py + 0.5 - Hd * 0.5) / focal
            for px in range(ix0, ix1 + 1):
                xc = (px + 0.5 - Wd * 0.5) / focal
                dist = z * math.sqrt(xc * xc + yc * yc + 1.0)
                if dist >= depth[py, px]:
                    continue
                dx = (px + 0.5 - sx[i]) / s
                dy = (py + 0.5 - sy[i]) / s
                u = dx * ca + dy * sa + bx[i]
                v = -dx * sa + dy * ca + by[i]
                tu = int(math.floor(u))
                tv = int(math.floor(v))
                if tu < 0 or tv < 0 or tu >= w or tv >= h:
                    continue
                q = o + tv * w + tu
                fl = Fl[q]
                if (fl & 1) == 0:
                    continue
                hsh = K.hash3(tu // 2, tv // 2, poid[i])
                if (fl & 2) != 0 and th > 0 and hsh < th:
                    continue
                h2 = K.hash3(tu, tv, poid[i] + 7)
                depth[py, px] = dist
                if h2 < dd:
                    alb[py, px, 0] = D[q, 0]
                    alb[py, px, 1] = D[q, 1]
                    alb[py, px, 2] = D[q, 2]
                else:
                    alb[py, px, 0] = A[q, 0]
                    alb[py, px, 1] = A[q, 1]
                    alb[py, px, 2] = A[q, 2]
                nrm[py, px, 0] = nx
                nrm[py, px, 1] = ny
                nrm[py, px, 2] = nz
                mat[py, px] = 14
                oid[py, px] = poid[i]
                var[py, px] = pvar[i]
                att[py, px] = 1.0 if (fl & 4) != 0 else 0.0
                aux[py, px] = dd


class Billboards:
    """A set of sprites placed in the world: base point, height in metres,
    which sprite, phase of its sway."""

    def __init__(self, atlas, key, P, Hm, tex_h, kinds, phase, oid0, var=None, period=4.0):
        self.atlas = atlas
        self.key = key
        self.P = np.asarray(P, float)
        self.Hm = np.asarray(Hm, float)
        self.kinds = np.asarray(kinds, int)
        self.tex_h = np.asarray(tex_h, float)               # texels tall of each instance's sprite
        self.phase = np.asarray(phase, float)
        self.oid = (oid0 + np.arange(len(self.P))).astype(np.int32)
        self.var = np.zeros(len(self.P), np.float32) if var is None else np.asarray(var, np.float32)
        self.period = period
        self.n = len(self.P)

    def draw(self, g, cam, t, dead=None, thin=None, tilt=None, maxd=1e9, minpx=1.5, sel=None, light_cam=False):
        if not self.n:
            return
        c = cam.to_cam(self.P)
        z = c[:, 2]
        mpt = self.Hm / self.tex_h                           # metres a texel
        s = mpt * cam.focal / np.maximum(z, 1e-3)            # screen px a texel
        Hpx = self.Hm * cam.focal / np.maximum(z, 1e-3)
        lim = cam.W / 2 / cam.focal
        ok = (z > 0.5) & (np.abs(c[:, 0]) < (lim * z + self.Hm)) & (Hpx > minpx) & (z < maxd)
        ok &= (c[:, 1] - self.Hm < cam.H / 2 / cam.focal * z) & (c[:, 1] + self.Hm * 1.5 > -cam.H / 2 / cam.focal * z)
        if sel is not None:
            ok &= sel
        if not ok.any():
            return
        i = np.where(ok)[0]
        mip = np.clip(np.round(-np.log2(np.maximum(s[i], 1e-6))), 0, 3).astype(int)
        sc = s[i] * 2.0 ** mip
        ent = self.atlas.entries[self.key]
        fid = np.empty(len(i), np.int32)
        ph = t / self.period + self.phase[i]
        for q, j in enumerate(i):
            frs = ent[self.kinds[j]]
            fid[q] = frs[int(math.floor(ph[q] * len(frs))) % len(frs)][mip[q]]
        bases = self.atlas.bases[self.key]
        bx = np.array([bases[self.kinds[j]][0] for j in i], float) / 2.0 ** mip
        by = np.array([bases[self.kinds[j]][1] for j in i], float) / 2.0 ** mip
        sxy = cam.W / 2 + c[i, 0] / z[i] * cam.focal, cam.H / 2 - c[i, 1] / z[i] * cam.focal
        dd = np.zeros(len(i)) if dead is None else np.asarray(dead, float)[i]
        th = np.clip(dd - 0.25, 0, 1) * 0.85 if thin is None else np.asarray(thin, float)[i]
        an = np.zeros(len(i)) if tilt is None else np.asarray(tilt, float)[i]
        f_ = -cam.R[2]
        nvec = f_ * 0.55 + np.array([0, 0.85, 0])
        nvec /= np.linalg.norm(nvec)
        A = self.atlas
        _sprites(np.ascontiguousarray(cam.R), float(cam.focal), sxy[0].astype(np.float64), sxy[1].astype(np.float64),
                 z[i].astype(np.float64), sc.astype(np.float64), an.astype(np.float64), bx + 0.5, by + 0.5,
                 fid, dd.astype(np.float64), th.astype(np.float64), self.oid[i], self.var[i], A.off, A.w, A.h, A.A, A.D,
                 A.Fl, g.depth, g.nrm, g.mat, g.oid, g.var, g.att, g.aux, g.alb, float(nvec[0]), float(nvec[1]),
                 float(nvec[2]))


def make_atlas(lib):
    """Pack the library: trees (each its own kind), the old pine, tufts,
    flowers, pampas. Bases (in full-size texels) per kind."""
    at = Atlas()
    at.bases = {}
    for key in ('trees', 'tufts', 'flowers', 'susuki'):
        ids, bases, tex_h = [], [], []
        for e in lib[key]:
            ids.append(at.add_frames(e['frames']))
            h, w = e['frames'][0].shape[:2]
            bases.append(e['base'] if e['base'] is not None else (w / 2, h - 1))
            tex_h.append(h)
        at.entries[key] = ids
        at.bases[key] = bases
        at.__dict__['texh_' + key] = tex_h
    e = lib['old_pine']
    at.entries['old_pine'] = [at.add_frames(e['frames'])]
    h, w = e['frames'][0].shape[:2]
    at.bases['old_pine'] = [e['base']]
    at.texh_old_pine = [h]
    at.finish()
    return at


def _add_frames(self, frames):
    """Add a sprite's frames; returns ids[frame][mip]."""
    ids = []
    for a in frames:
        d, leaf, top = twin(a)
        mips = []
        cur = (a, d, leaf, top)
        for m in range(4):
            if cur is None:
                mips.append(mips[-1])
                continue
            a_, d_, l_, t_ = cur
            mips.append(self._push(a_, d_, l_, t_))
            cur = half(a_, d_, l_, t_)
        ids.append(mips)
    return ids


Atlas.add_frames = _add_frames
