"""The valley at night, drawn as pixel art: sky, moon, land, lake, and the
lighting that turns a g-buffer into pixels.

Lighting is the pixel artist's: the moon's light is cut into a few bands (with
ordered dither where they meet), each band a hue-shifted colour of the
material - cool and dark in shadow, pale in the moonlight - and things that
stand in front of others get a dark line round them. The look of the night
(sky, moon, light colours, fog) comes in a `look` dict, so the film can turn
the moon to blood.

Colours are BGR floats 0..255.
"""
import math
import os
import sys

import cv2
import numpy as np
from numba import njit

import hd2d as K
from terrain import Land, WATER, LAKE, lake_e, PADDY, in_paddies

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'gaki-rampage'))
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))

# materials
SKY, LAND, WATERM, BARK, LEAF, GRASS, PETAL, STEM, CORE, EYE, CRACK, ROCK, ROACH, MOUTH, SPRITE, SKIN, TOOTH, LIP, DIKE, \
    EYEBALL = range(20)


def rgb(*c):
    return np.array(c[::-1], np.float32)


def moon_dir(az, el):
    return np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)])


# ---------------------------------------------------------------- the moon's face
def moon_texture(n=128, seed=4):
    """A full moon: dark seas, craters with bright rims and rays, darker at the
    limb. Values 0..1 on an n x n disc (nan outside)."""
    r = np.random.RandomState(seed)
    y, x = (np.mgrid[0:n, 0:n] + 0.5 - n / 2) / (n / 2)
    rr = np.sqrt(x * x + y * y)
    z = np.sqrt(np.clip(1 - rr * rr, 0, 1))
    X = (x * 3.0 + 10).ravel()
    Y = (y * 3.0 + 10).ravel()
    seas = K.fbm(X, Y, 5, 7).reshape(n, n)
    v = 0.78 - 0.55 * np.clip((seas + 0.06) * 3.2, 0, 1)
    v += 0.08 * K.fbm(X * 4, Y * 4, 4, 9).reshape(n, n)
    for k in range(26):
        cx, cy = r.uniform(-0.85, 0.85, 2)
        cr = r.uniform(0.03, 0.12) if k > 2 else r.uniform(0.1, 0.16)
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / cr
        v -= 0.16 * np.exp(-((d - 0.55) / 0.3) ** 2) * (d < 1)
        v += 0.18 * np.exp(-((d - 1.0) / 0.12) ** 2)
        if k < 2:                                              # a young crater's rays
            ang = np.arctan2(y - cy, x - cx)
            rays = np.clip(np.cos(ang * 9 + k), 0, 1) ** 6 * np.exp(-d / 6) * (d > 1)
            v += 0.12 * rays
    v *= 0.55 + 0.45 * z ** 0.4
    v[rr > 1] = np.nan
    return v


# ---------------------------------------------------------------- sky
@njit(cache=True)
def _clouds(dx, dy, dz, ex, ez, alt, t, seed, sc, cover):
    """Cloud density and a lit factor per ray, from a layer at altitude alt."""
    n = dx.shape[0]
    den = np.zeros(n, np.float32)
    for i in range(n):
        if dy[i] <= 0.01:
            continue
        s = alt / dy[i]
        x = (ex + dx[i] * s) / sc + t * 0.004
        z = (ez + dz[i] * s) / sc
        # long bands of stratus: stretched noise
        a, v, tot = 1.0, 0.0, 0.0
        xx, zz = x * 0.55, z * 1.8
        for o in range(6):
            v += a * K.pnoise(xx, zz, seed + o * 13)
            tot += a
            xx = xx * 2.1 + 3.1
            zz = zz * 2.1 - 1.7
            a *= 0.52
        v = v / tot + cover
        den[i] = max(0.0, min(1.0, v * 3.5))
    return den


class Sky:
    def __init__(self):
        self.moon_tex = moon_texture()

    def draw(self, cam, rd, look, t):
        """The sky behind everything: gradient in bands, stars, clouds, the moon."""
        h, w = rd.shape[:2]
        el = rd[..., 1]
        ramp = look['sky']                                     # zenith .. horizon
        u = np.clip(1 - el / 0.9, 0, 1) ** 2.2                 # 0 at zenith, 1 at horizon
        m = look['moon']
        cosm = rd @ m
        u = np.clip(u - 0.25 * np.clip((cosm - 0.8) / 0.2, 0, 1) ** 2, 0, 1)
        img = ramp[K.band(u, len(ramp), 0.9)].astype(np.float32)
        # the halo round the moon: soft, then banded
        halo = np.clip((cosm - 0.9) / 0.1, 0, 1) ** 3
        hb = K.band(halo, 6, 0.9) / 5.0
        img = img + hb[..., None] * look['halo']
        # stars, pinned to the sky
        az = np.arctan2(rd[..., 0], rd[..., 2])
        q = 900.0
        ix = np.floor(az * q / 6.283 * 2.2).astype(np.int64)
        iy = np.floor(el * q / 6.283 * 2.2).astype(np.int64)
        hsh = ((ix * 73856093) ^ (iy * 19349663)) & 0xFFFFF
        star = (hsh % 977 == 0) | (hsh % 1999 == 3)
        bright = (hsh % 3 == 0)
        tw = 0.6 + 0.4 * np.sin(t * 3 + hsh * 0.37)
        vis = star & (el > 0.02) & (halo < 0.2)
        img[vis] = img[vis] * 0.3 + look['star'] * (0.55 + 0.45 * bright[vis, None]) * tw[vis, None] * \
            np.clip(el[vis, None] * 6, 0.3, 1) * look.get('stars', 1.0)
        # clouds: a layer of stratus, lit on the moon's side
        flat = rd.reshape(-1, 3)
        den = _clouds(flat[:, 0].copy(), flat[:, 1].copy(), flat[:, 2].copy(), cam.eye[0], cam.eye[2], 2600.0, t,
                      21, 5200.0, look.get('cloud_cover', -0.16)).reshape(h, w)
        if den.any():
            lit = np.clip((cosm - 0.55) / 0.45, 0, 1)
            cb = K.band(den, 4, 0.9)
            cl = look['cloud_dark'] * (1 - lit[..., None]) + look['cloud_lit'] * lit[..., None]
            k = (cb / 3.0)[..., None]
            img = np.where((cb > 0)[..., None], img * (1 - k * 0.85) + cl * k * 0.85 +
                           look['cloud_lit'] * (k * lit[..., None] * 0.25), img)
        self.moon_disc(img, cam, look)
        return img

    def moon_disc(self, img, cam, look):
        """The full moon: seas, craters and rays, cut into the moon's ramp."""
        m = look['moon']
        x, y, z = cam.project((cam.eye + m * 1e5)[None])
        if z[0] <= 0:
            return
        R = math.tan(look.get('moon_r', 0.032)) * cam.focal
        n = int(R * 2) + 1
        if n < 3:
            return
        tex = cv2.resize(np.nan_to_num(self.moon_tex, nan=-1), (n, n), interpolation=cv2.INTER_AREA)
        x0, y0 = int(round(x[0] - n / 2)), int(round(y[0] - n / 2))
        yy, xx = np.mgrid[0:n, 0:n]
        inside = ((xx + 0.5 - n / 2) ** 2 + (yy + 0.5 - n / 2) ** 2) <= (n / 2) ** 2
        b = K.band(np.clip(tex, 0, 1), len(look['moon_ramp']), 0.8, x0, y0)
        col = look['moon_ramp'][b]
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(img.shape[1], x0 + n), min(img.shape[0], y0 + n)
        if X1 <= X0 or Y1 <= Y0:
            return
        sub = (slice(Y0 - y0, Y1 - y0), slice(X0 - x0, X1 - x0))
        msk = inside[sub]
        img[Y0:Y1, X0:X1][msk] = col[sub][msk]
        self.moon_box = (X0, Y0, X1, Y1)


# ---------------------------------------------------------------- materials
class Mats:
    """Albedo variants per material (alive and dead), BGR 0..1."""
    MEADOW = [rgb(40, 72, 44), rgb(50, 88, 48), rgb(64, 102, 54), rgb(34, 62, 44)]
    MEADOW_DEAD = [rgb(70, 64, 56), rgb(86, 78, 64), rgb(58, 56, 52), rgb(98, 90, 76)]
    FOREST_FLOOR = [rgb(40, 54, 38), rgb(52, 62, 40), rgb(34, 44, 36), rgb(58, 52, 40)]
    CANOPY = [rgb(30, 56, 42), rgb(40, 70, 46), rgb(24, 44, 40), rgb(52, 80, 50)]
    CANOPY_DEAD = [rgb(70, 62, 56), rgb(84, 74, 64), rgb(58, 54, 52), rgb(96, 86, 74)]
    ROCK = [rgb(96, 92, 92), rgb(118, 112, 108), rgb(80, 78, 84), rgb(134, 126, 116)]
    SNOW = [rgb(226, 232, 244), rgb(240, 244, 250), rgb(206, 214, 232), rgb(250, 250, 252)]
    SHORE = [rgb(98, 88, 70), rgb(116, 104, 82), rgb(82, 76, 64), rgb(130, 118, 94)]
    MUD = [rgb(52, 44, 40), rgb(64, 54, 46), rgb(44, 38, 36), rgb(72, 62, 52)]

    @staticmethod
    def arr(lst):
        return np.stack(lst) / 255.0


# ---------------------------------------------------------------- the world
class World:
    def __init__(self, moon=(0.75, 0.36), key=(1.45, 0.55)):
        self.land = Land()
        self.sky = Sky()
        v, f, vn = self.land.mesh()
        self.tv, self.tf, self.tvn = v, f, vn.astype(np.float64)
        n = len(f)
        self.t_mat = np.full(n, LAND, np.int16)
        self.t_oid = np.ones(n, np.int32)
        self.t_var = np.zeros(n, np.float32)
        self.t_va = np.zeros(len(v))
        # what of the land stands above the water (for the reflection)
        above = v[f][:, :, 1].max(1) > WATER + 0.05
        self.rf = f[above]
        self.water = self._water()
        self.moon = moon_dir(*moon)
        self.key = moon_dir(*key)
        self.extra = []                     # things that draw into the g-buffer: fn(g, cam, t, ctx)
        self._shadow = None

    def _water(self):
        cx, cz, rx, rz = LAKE
        n = 64
        a = np.linspace(0, 2 * math.pi, n, endpoint=False)
        ring = np.stack([cx + np.cos(a) * rx * 1.5, np.full(n, WATER), cz + np.sin(a) * rz * 1.5], 1)
        v = np.vstack([[cx, WATER, cz], ring])
        f = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]
        x0, x1, z0, z1 = PADDY                          # and the rice fields
        b = len(v)
        v = np.vstack([v, [[x0 - 6, WATER, z0 - 6], [x1 + 6, WATER, z0 - 6], [x1 + 6, WATER, z1 + 6],
                           [x0 - 6, WATER, z1 + 6]]])
        f += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
        return v, np.array(f, np.int32)

    # -------------------------------------------------------------- shadows
    def shadows(self, statics=()):
        """The moon's shadow maps: one fine round the film, one coarse for the
        whole valley. Static things are drawn once."""
        if self._shadow is None:
            near = K.ShadowMap((60, 0, 600), self.key, 1500, 2048)
            far = K.ShadowMap((0, 300, 4000), self.key, 10000, 2048)
            for sm in (near, far):
                K.draw_tris(sm.g, sm.cam, self.tv, self.tf, self.tvn, self.t_va, self.t_mat, self.t_oid, self.t_var)
            for fn in statics:
                fn(near.g, near.cam)
            self._shadow = (near, far)
        return self._shadow

    def lit(self, P, dyn=None):
        near, far = self._shadow
        s = far.lookup(P, bias=far.texel * 3)
        inn = np.abs(P[..., 0] - near.centre[0]) < 1400
        inn &= np.abs(P[..., 2] - near.centre[2]) < 1400
        if inn.any():
            s[inn] = np.minimum(s[inn], near.lookup(P[inn]))
        if dyn is not None and inn.any():
            s[inn] = np.minimum(s[inn], dyn.lookup(P[inn]))
        return s

    # -------------------------------------------------------------- one view
    def gbuffer(self, cam, t, ctx, mirror=False):
        g = K.GBuf(cam.W, cam.H)
        if mirror:
            v = self.tv.copy()
            v[:, 1] = 2 * WATER - v[:, 1]
            vn = self.tvn * np.array([1, -1, 1.0])
            K.draw_tris(g, cam, v, self.rf, vn, self.t_va, self.t_mat, self.t_oid, self.t_var)
        else:
            K.draw_tris(g, cam, self.tv, self.tf, self.tvn, self.t_va, self.t_mat, self.t_oid, self.t_var)
            wv, wf = self.water
            K.draw_tris(g, cam, wv, wf, np.tile([0, 1.0, 0], (len(wv), 1)), np.zeros(len(wv)),
                        np.full(len(wf), WATERM, np.int16), np.full(len(wf), 2, np.int32),
                        np.zeros(len(wf), np.float32))
        for fn in self.extra:
            fn(g, cam, t, ctx, mirror)
        return g

    def render(self, cam, t, look, ctx):
        """The frame: BGR float image (H, W, 3), plus the g-buffer and the
        light bands (for things drawn on top later, like the roaches)."""
        rd, zlen = K.rays(cam)
        ctx['rd'] = rd
        g = self.gbuffer(cam, t, ctx)
        img = self.sky.draw(cam, rd, look, t)
        solid = g.depth < 1e29
        P = cam.eye + rd * g.depth[..., None]
        ctx['P'] = P
        col, light = self.shade(cam, g, P, rd, solid & (g.mat != WATERM), look, t, ctx)
        img[solid] = col[solid]
        wm = solid & (g.mat == WATERM)
        if wm.any():
            img[wm] = self.water_col(cam, g, P, rd, wm, look, t, ctx, img)
        # outlines where something stands in front of something else
        e = K.edges(g.depth, g.oid)
        e &= solid & (g.mat != LAND) & (g.mat != WATERM)
        img[e] = img[e] * look.get('line', 0.5) + look['ink'] * (1 - look.get('line', 0.5))
        img = self.fog(img, g.depth, P, rd, cam, look, solid)
        return img, g, light

    # -------------------------------------------------------------- lighting
    def shade(self, cam, g, P, rd, m, look, t, ctx, mirror=False):
        """Colour of every g-buffer pixel in mask m."""
        h, w = g.depth.shape
        col = np.zeros((h, w, 3), np.float32)
        light = np.zeros((h, w), np.int32)
        if not m.any():
            return col, light
        idx = np.where(m)
        Pm = P[idx]
        n = g.nrm[idx]
        n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        if mirror:
            n = n * np.array([1, -1, 1.0])
        mat = g.mat[idx]
        var = g.var[idx]
        att = g.att[idx]
        dist = g.depth[idx]
        foot = dist / cam.focal                                    # metres a pixel covers
        V = -rd[idx]
        flip = (n * V).sum(1) < 0
        n[flip & (mat != LAND)] *= -1
        alb = np.zeros((len(mat), 3), np.float32)
        dead = ctx['dead'](Pm[:, 0], Pm[:, 2]) if 'dead' in ctx else np.zeros(len(mat))
        bx = idx[1] % 4
        by = idx[0] % 4
        dith = K.BAYER[by, bx]
        wrap = np.zeros(len(mat), np.float32)
        amb_k = np.ones(len(mat), np.float32)
        spec = np.zeros(len(mat), np.float32)
        ibias = np.zeros(len(mat), np.float32)
        rim_k = np.zeros(len(mat), np.float32)
        aux = g.aux[idx]
        uvm = g.uv[idx]
        # -- land
        L = mat == LAND
        if L.any():
            pl = Pm[L]
            nl = self.land.normal(pl[:, 0], pl[:, 2])
            fl = foot[L]
            x, z, y = pl[:, 0], pl[:, 2], pl[:, 1]
            det = K.fbm_lod(x * 0.35, z * 0.35, fl * 0.35, 7, 101)
            det2 = K.fbm_lod(x * 0.05, z * 0.05, fl * 0.05, 5, 103)
            # bumps in the normal: clumps of grass, cracks in rock
            bump = K.fbm_lod(x * 0.9 + 3, z * 0.9, fl * 0.9, 4, 107)
            bump2 = K.fbm_lod(x * 0.9, z * 0.9 + 3, fl * 0.9, 4, 109)
            nl = nl + np.stack([bump, np.zeros_like(bump), bump2], 1) * 0.5
            nl /= np.linalg.norm(nl, axis=1, keepdims=True)
            n[L] = nl
            slope = 1 - self.land.normal(x, z)[:, 1]
            snowline = 1350 + 260 * det2 + 120 * det
            snow = (y > snowline) & (slope < 0.42 + 0.3 * det)
            rock = ~snow & ((slope > 0.3 + 0.12 * det) | (y > 1250 + 200 * det2))
            treeline = 950 + 250 * det2
            le = lake_e(x, z)
            shore = (le < 1.5 + 0.2 * det) & (y < WATER + 1.2)
            in_valley = ((x / 2600) ** 2 + ((z - 1000) / 2050) ** 2) < 1 + 0.25 * det2
            woods = ctx['woods'](x, z) if 'woods' in ctx else np.zeros(len(x), bool)
            near_f = ctx['near_forest'](x, z) if 'near_forest' in ctx else np.zeros(len(x), bool)
            canopy = ~snow & ~rock & ~shore & (y < treeline) & ((~in_valley & ~near_f) | (woods & ~near_f))
            ffloor = ~snow & ~rock & ~shore & ~canopy & woods
            meadow = ~snow & ~rock & ~shore & ~canopy & ~ffloor
            vsel = np.clip(((det + 0.5) * 4 + (dith[L] - 0.5) * 0.9).astype(int), 0, 3)
            a = np.zeros((len(x), 3), np.float32)
            for mask, alive, deadc in ((meadow, Mats.MEADOW, Mats.MEADOW_DEAD), (ffloor, Mats.FOREST_FLOOR, Mats.MUD),
                                       (canopy, Mats.CANOPY, Mats.CANOPY_DEAD), (rock, Mats.ROCK, Mats.ROCK),
                                       (snow, Mats.SNOW, Mats.SNOW), (shore, Mats.SHORE, Mats.MUD)):
                if mask.any():
                    A = Mats.arr(alive)[vsel[mask]]
                    D = Mats.arr(deadc)[vsel[mask]]
                    dd = dead[L][mask]
                    pick = (dd > dith[L][mask] * 0.98 + 0.01)[:, None]
                    a[mask] = np.where(pick, D, A)
            # canopy is bumpy: lumps of tree crowns
            if canopy.any():
                cb = K.fbm_lod(x[canopy] * 0.06, z[canopy] * 0.06, fl[canopy] * 0.06, 4, 111)
                cb2 = K.fbm_lod(x[canopy] * 0.06 + 5, z[canopy] * 0.06, fl[canopy] * 0.06, 4, 113)
                q = n[L][canopy] + np.stack([cb, np.abs(cb) * 0.5, cb2], 1) * 1.6
                tmp = n[L]
                tmp[canopy] = q / np.linalg.norm(q, axis=1, keepdims=True)
                n[L] = tmp
            if 'crack' in ctx:
                ck = ctx['crack'](x, z)
                if ck.any():
                    a[ck > 0.5] = rgb(10, 6, 8) / 255
                    rimc = (ck > 0.05) & (ck <= 0.5)
                    a[rimc] = a[rimc] * 0.55 + rgb(70, 52, 40) / 255 * 0.45
                    ctx['_crack'] = (np.where(L)[0], ck)
            spec_l = np.where(snow, 0.25, 0.0)
            spec[L] = spec_l
            alb[L] = a
            ao = np.clip(1 + det * 0.5, 0.6, 1.2)
            amb_k[L] = ao
            ctx['_land_kind'] = (meadow, ffloor, canopy, rock, snow, shore)
        S = mat == SPRITE                         # the pack's sprites: their own colours, the moon's rim on top edges
        if S.any():
            alb[S] = g.alb[idx][S]
            wrap[S] = 0.5
            amb_k[S] = 1.0
            ibias[S] = np.where(att[S] > 0.5, 0.32, 0.0)
        mats = dict(MATERIALS)
        mats.update(ctx.get('materials', {}))
        for mm, fn in mats.items():
            S = mat == mm
            if S.any():
                a, wr, ak, sp, ib, rk = fn(Pm[S], n[S], var[S], att[S], aux[S], dith[S], t, uvm[S])
                alb[S] = a
                wrap[S] = wr
                amb_k[S] = ak
                spec[S] = sp
                ibias[S] = ib
                rim_k[S] = rk
        # -- light
        md = look['key']
        lf = mat == LEAF
        aob = g.ao[idx]
        if lf.any():                                   # each leaf turned its own way
            j = att[lf]
            jit = np.stack([np.cos(j * 37.0), np.sin(j * 53.0) * 0.6 + 0.2, np.cos(j * 71.0)], 1) * (j > 0)[:, None]
            q = n[lf] + jit * 0.6
            n[lf] = q / np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-9)
        deep = np.isin(mat, (LEAF, BARK, CORE, SKIN, LIP, TOOTH, EYEBALL))
        amb_k = np.where(deep, amb_k * aob, amb_k)
        ndl = (n @ md)
        sh = self.lit(Pm + n * (0.2 + foot[:, None] * 1.5), ctx.get('dyn_shadow'))
        direct = np.clip((ndl + wrap) / (1 + wrap), 0, 1) * sh
        direct = np.where(lf, direct * (0.45 + 0.55 * aob), direct)
        trans = np.where(lf, np.clip((rd[idx] @ md), 0, 1) ** 2 * sh * 0.4 * aob, 0)
        sky_amb = (0.55 + 0.45 * n[:, 1]) * amb_k
        Hh = (V + md)
        Hh /= np.linalg.norm(Hh, axis=1, keepdims=True)
        sp = np.clip((n * Hh).sum(1), 0, 1) ** 24 * spec * sh
        nv = np.abs((n * V).sum(1))
        rim = (1 - nv) ** 3 * np.clip(n @ look['moon'] + 0.35, 0, 1) * rim_k
        fill = np.where(mat == LAND, 0.0, np.clip(nv, 0, 1) * look.get('fill', 0.16))   # soft light from the camera
        I = np.clip(direct * look['direct'] + sky_amb * look['ambient'] + sp + rim * look.get('rim', 0.6) + ibias + trans +
                    fill, 0, 1.4)
        nb = look['bands']
        b = np.clip(np.floor(I / 1.4 * (nb - 1) + 0.5 + (dith - 0.5) * 0.75), 0, nb - 1).astype(np.int32)
        lc = look['light'][b]                                      # light colour of each band
        c = alb * lc * 255
        ems = dict(EMISSIVE)
        ems.update(ctx.get('emissive', {}))
        for mm, fn in ems.items():
            S = mat == mm
            if S.any():
                c[S] = fn(Pm[S], var[S], att[S], aux[S], t, b[S], uvm[S])
        if L.any() and look.get('front', 0) > 0:
            dl = dead[L]
            fr = (dl > 0.03) & (dl < 0.45)
            if fr.any():
                k = np.clip(1 - np.abs(dl[fr] - 0.2) / 0.2, 0, 1) * look['front']
                q = np.where(L)[0][fr]
                on = k > dith[q] * 0.9 + 0.05
                c[q[on]] = c[q[on]] * 0.4 + look['front_col'] * 0.6
        if '_crack' in ctx:
            q, ck = ctx.pop('_crack')
            glow = ck > 0.5
            if glow.any() and look.get('crack_glow', 0) > 0:
                c[q[glow]] += look['crack_col'] * look['crack_glow'] * (0.5 + 0.5 * dith[q[glow]])[:, None]
        col[idx] = c
        light[idx] = b
        return col, light

    def water_col(self, cam, g, P, rd, wm, look, t, ctx, sky_img):
        """The lake: the world upside down in it, broken by ripples, the moon's road."""
        h, w = g.depth.shape
        gm = self.gbuffer(cam, t, ctx, mirror=True)
        Pm = cam.eye + rd * gm.depth[..., None]
        Pm[..., 1] = 2 * WATER - Pm[..., 1]
        solid = gm.depth < 1e29
        rcol, _ = self.shade(cam, gm, Pm, rd, solid & (gm.mat != WATERM), look, t, ctx, mirror=True)
        # the sky reflected: the mirrored ray's sky
        rdm = rd.copy()
        rdm[..., 1] *= -1
        rsky = self.sky.draw(cam_mirror(cam), rdm, look, t)
        refl = np.where(solid[..., None], self.fog(rcol, gm.depth, Pm, rd, cam, look, solid), rsky)
        idx = np.where(wm)
        X, Z = P[idx][:, 0], P[idx][:, 2]
        dist = g.depth[idx]
        rip = K.fbm(X * 0.08 + t * 0.15, Z * 0.3, 3, 201) + K.fbm(X * 0.3, Z * 0.9 - t * 0.2, 2, 203) * 0.5
        dy = np.clip(rip * 180 / np.maximum(dist, 1) * 4, -6, 6).astype(int)
        ys = np.clip(idx[0] + dy, 0, h - 1)
        xs = np.clip(idx[1] + (rip * 3).astype(int), 0, w - 1)
        r = refl[ys, xs]
        deep = look['water']
        fres = 0.55 + 0.4 * (1 - np.clip(-rd[idx][:, 1] * 4, 0, 1))
        c = deep * (1 - fres[:, None]) + r * fres[:, None] * 0.9
        # the moon's road: glints where the ripples face it
        m = look['moon']
        rr = rd[idx].copy()
        rr[:, 1] *= -1
        a = (rr @ m)
        glint = (a + rip * 0.05 > 0.985 - 0.02 * (1 - np.clip(dist / 3000, 0, 1))) & \
            (K.fbm(X * 0.5, Z * 2.2 + t * 0.6, 2, 207) > 0.05)
        c[glint] = look['glint']
        dead = ctx['dead'](X, Z) if 'dead' in ctx else np.zeros(len(X))
        c = c * (1 - dead[:, None] * 0.5) + look['dead_water'] * dead[:, None] * 0.5
        rip = ctx.get('ripples')                          # rings where they come up out of the water
        if rip is not None and len(rip):
            near = np.zeros(len(X), bool)
            for (rx, rz, age, sz) in rip:
                r = age * (0.4 + 1.6 * sz)
                dd = np.abs(np.hypot(X - rx, Z - rz) - r)
                near |= dd < (0.03 + 0.08 * sz) * (1 + r)
            c[near] = c[near] * 0.7 + look['glint'] * 0.22
        pad = in_paddies(X, Z) & (dist > ctx.get('rice_near', 0.0))
        if pad.any():
            foot = dist[pad] / cam.focal
            u = (X[pad] - PADDY[0]) / 0.6
            v = (Z[pad] - PADDY[2]) / 0.45
            du = np.abs(u - np.floor(u) - 0.5)
            dv = np.abs(v - np.floor(v) - 0.5)
            hard = ((du < 0.16) & (dv < 0.3)).astype(float)
            soft = 0.19
            k = np.clip((foot - 0.15) / 0.5, 0, 1)
            cov = hard * (1 - k) + soft * k
            dd = dead[pad][:, None]
            green = rgb(50, 88, 46) * (1 - dd) + rgb(82, 70, 50) * dd
            bb = K.BAYER[idx[0][pad] % 4, idx[1][pad] % 4]
            on = (cov > bb * 0.95)[:, None]
            lit = 0.55 + 0.45 * np.clip(-rd[idx][pad][:, 1] * 3, 0, 1)
            c[pad] = np.where(on, green * lit[:, None] * look['light'][2] * 1.6, c[pad])
        return c

    def fog(self, img, depth, P, rd, cam, look, solid):
        """Air: things far off go blue-grey; mist lies low in the valley."""
        d = np.minimum(depth, 4e4)
        far = 1 - np.exp(-d / look.get('haze', 9000.0))
        y = np.clip(P[..., 1], -10, 3000)
        patch = 0.6 + 0.8 * np.clip(K.fbm((P[..., 0] / 260.0).ravel(), (P[..., 2] / 160.0).ravel(), 3, 301).reshape(d.shape)
                                    + 0.3, 0, 1)
        mist = (1 - np.exp(-d / look.get('mist_d', 1200.0))) * np.exp(-np.maximum(y - 2, 0) / look.get('mist_h', 30.0))
        mist = np.clip(mist * patch * look.get('mist', 0.55), 0, 0.85) * solid
        f = np.clip(far, 0, 0.92) * solid
        img = img * (1 - f[..., None]) + look['fog'] * f[..., None]
        mb = K.band(mist / 0.85, 5, 0.9) / 4.0 * 0.85
        return img * (1 - mb[..., None]) + look['mist_col'] * mb[..., None]


def cam_mirror(cam):
    return cam


# ---------------------------------------------------------------- materials of things that grow
def _ramp3(cols):
    return np.array([rgb(*c) for c in cols]) / 255.0


def _leaf(P, n, var, att, aux, dith, t, uv=None):
    from flora import LEAF_COL, LEAF_DEAD, LEAF_ASH, SPECIES
    sp = np.clip(var.astype(int), 0, 3)
    vr = var - sp
    tone = np.where(att > 0, np.clip((att * 2.6 + (vr - 0.5) * 0.8).astype(int), 0, 2),
                    np.clip((vr * 2.99).astype(int), 0, 2))
    alb = np.zeros((len(var), 3), np.float32)
    for k, name in enumerate(SPECIES):
        S = sp == k
        if not S.any():
            continue
        if name == 'momiji':                       # red, orange or gold, tree by tree
            fam = (vr[S] * 3).astype(int)
            cols = [_ramp3([(124, 26, 30), (168, 38, 34), (204, 64, 40)]),
                    _ramp3([(160, 60, 26), (206, 98, 34), (230, 140, 52)]),
                    _ramp3([(170, 118, 30), (214, 166, 48), (238, 204, 92)])]
            a = np.zeros((S.sum(), 3), np.float32)
            for f in range(3):
                q = fam == f
                a[q] = cols[f][tone[S][q]]
            alb[S] = a
        else:
            alb[S] = _ramp3(LEAF_COL[name])[tone[S]]
    brown = _ramp3(LEAF_DEAD)[tone]
    ash = _ramp3(LEAF_ASH)[tone]
    d = aux
    b1 = (d * 1.8 > dith)[:, None]
    b2 = ((d - 0.55) * 2.4 > dith)[:, None]
    alb = np.where(b2, ash, np.where(b1, brown, alb))
    return alb, 0.45, 0.85, 0.0, (att - 0.5) * 0.22 - 0.04, 0.8


def _bark(P, n, var, att, aux, dith, t, uv=None):
    a = np.where((aux > dith * 0.9 + 0.05)[:, None], rgb(84, 80, 78) / 255, rgb(58, 46, 42) / 255)
    a = a * (0.85 + 0.3 * ((P[:, 1] * 3.1 + P[:, 0] * 0.7) % 1.0 > 0.5))[:, None]
    return a, 0.1, 0.8, 0.0, 0.0, 0.7


def _grass(P, n, var, att, aux, dith, t, uv=None):
    fam = (var * 4).astype(int) % 4
    alive = _ramp3([(40, 76, 42), (52, 94, 46), (70, 110, 52), (88, 110, 56)])[fam]
    straw = _ramp3([(104, 90, 64), (118, 102, 72), (90, 80, 60), (126, 112, 84)])[fam]
    ash = _ramp3([(62, 58, 56), (74, 70, 66), (54, 52, 52), (82, 78, 72)])[fam]
    b1 = (aux * 1.7 > dith)[:, None]
    b2 = ((aux - 0.6) * 2.5 > dith)[:, None]
    a = np.where(b2, ash, np.where(b1, straw, alive))
    a = a * (0.5 + 0.55 * np.clip(att, 0, 1))[:, None]
    return a, 0.5, 0.75, 0.0, (att - 0.6) * 0.18, 0.5


def _petal(P, n, var, att, aux, dith, t, uv=None):
    a = np.where((var < 0.03)[:, None], rgb(206, 30, 42) / 255,
                 np.where((var < 0.2)[:, None], rgb(236, 74, 82) / 255,
                          np.where((var < 0.4)[:, None], rgb(116, 96, 214) / 255, rgb(236, 230, 240) / 255)))
    d = (aux * 1.6 > dith)[:, None]
    a = np.where(d, rgb(66, 44, 40) / 255, a)
    return a, 0.5, 0.9, 0.0, 0.08, 0.3


def _stem(P, n, var, att, aux, dith, t, uv=None):
    a = np.where((aux * 1.6 > dith)[:, None], rgb(92, 78, 60) / 255, rgb(50, 92, 42) / 255)
    return a, 0.4, 0.8, 0.0, 0.0, 0.3


def _rock(P, n, var, att, aux, dith, t, uv=None):
    k = (var * 3).astype(int)
    a = _ramp3([(92, 90, 92), (112, 108, 106), (128, 122, 116)])[np.clip(k, 0, 2)]
    a[var < 0.3] = rgb(66, 50, 38) / 255                     # clods of earth
    return a, 0.0, 0.9, 0.08, 0.0, 0.5


def _roach(P, n, var, att, aux, dith, t, uv=None):
    """A cockroach's shell: mahogany wings with the seam down the middle and
    a lighter streak each side of it; the shield behind the head dark in the
    middle with a pale cream rim; dark head; legs and feelers."""
    u, w = uv[:, 0], uv[:, 1]                       # along the body, across it (unit-sphere coords)
    a = np.tile(rgb(84, 38, 22) / 255, (len(P), 1))
    shell = var < 0.3
    pron = (var >= 0.3) & (var < 0.7)
    head = (var >= 0.7) & (var < 0.92)
    legs = var >= 0.92
    seam = shell & (np.abs(w) < 0.09) & (u > -0.85)
    streak = shell & (np.abs(np.abs(w) - 0.32) < 0.1) & (u > -0.5) & (u < 0.75)
    edge = shell & (np.abs(w) > 0.82)
    a[streak] = rgb(132, 64, 32) / 255
    a[edge] = rgb(58, 26, 18) / 255
    a[seam] = rgb(34, 16, 12) / 255
    rr = np.sqrt(u * u + w * w)
    a[pron] = rgb(46, 24, 18) / 255
    rim = pron & (rr > 0.74)
    a[rim] = rgb(124, 86, 50) / 255
    spots = pron & (rr < 0.5) & (np.abs(np.abs(w) - 0.28) < 0.13)
    a[spots] = rgb(92, 52, 30) / 255
    a[head] = rgb(56, 32, 22) / 255
    a[legs] = rgb(104, 60, 36) / 255
    spec = np.where(shell, 1.5, np.where(pron, 1.0, 0.3))
    return a, 0.05, 0.75, spec, 0.0, 1.0


def _core(P, n, var, att, aux, dith, t, uv=None):
    return np.tile(rgb(34, 22, 20) / 255, (len(P), 1)), 0.0, 0.6, 0.6, -0.05, 0.9


def _skin(P, n, var, att, aux, dith, t, uv=None):
    """Pale skin, a little waxy, the light soaking into it."""
    return np.tile(rgb(214, 210, 204) / 255, (len(P), 1)), 0.35, 1.0, 0.12, 0.0, 1.3


def _tooth(P, n, var, att, aux, dith, t, uv=None):
    return np.tile(rgb(234, 222, 190) / 255, (len(P), 1)), 0.2, 1.0, 0.5, 0.05, 0.6


def _lip(P, n, var, att, aux, dith, t, uv=None):
    return np.tile(rgb(150, 100, 108) / 255, (len(P), 1)), 0.3, 1.0, 0.3, 0.0, 0.8


def _dike(P, n, var, att, aux, dith, t, uv=None):
    """The banks between the rice fields: packed earth under grass, grainy close up."""
    k = (np.floor(P[:, 0] * 1.7) + np.floor(P[:, 2] * 1.3) + np.floor(P[:, 1] * 3)) % 3
    fine = (np.floor(P[:, 0] * 160) * 7 + np.floor(P[:, 2] * 160) * 13 + np.floor(P[:, 1] * 160) * 5) % 5
    k = np.where(fine == 0, (k + 1) % 3, k)
    alive = _ramp3([(46, 66, 40), (58, 78, 44), (70, 70, 46)])[k.astype(int)]
    deadc = _ramp3([(78, 68, 54), (92, 80, 62), (66, 60, 52)])[k.astype(int)]
    a = np.where((aux * 1.6 > dith)[:, None], deadc, alive)
    return a, 0.25, 0.9, 0.0, 0.0, 0.3


def _eyeball(P, n, var, att, aux, dith, t, uv=None):
    return np.tile(rgb(46, 14, 18) / 255, (len(P), 1)), 0.0, 0.7, 1.4, 0.0, 0.4


MATERIALS = {LEAF: _leaf, BARK: _bark, GRASS: _grass, PETAL: _petal, STEM: _stem, ROCK: _rock, ROACH: _roach,
             CORE: _core, SKIN: _skin, TOOTH: _tooth, LIP: _lip, DIKE: _dike, EYEBALL: _eyeball}


def _eye(P, var, att, aux, t, band, uv=None):
    r = np.sqrt(uv[:, 0] ** 2 + uv[:, 1] ** 2) if uv is not None else np.zeros(len(P))
    c = np.where((r < 0.35)[:, None], rgb(255, 236, 190), np.where((r < 0.7)[:, None], rgb(255, 120, 60),
                                                                   rgb(220, 40, 30)))
    return c * np.clip(var, 0, 1)[:, None] + rgb(30, 4, 4)


def _mouth(P, var, att, aux, t, band, uv=None):
    return np.tile(rgb(6, 2, 4), (len(P), 1))


EMISSIVE = {EYE: _eye, MOUTH: _mouth}


# ---------------------------------------------------------------- the look of a night
def look_night(blood=0.0):
    """The palette of the night, from a cold moonlit dusk (0) to the blood moon (1)."""
    b = blood

    def mix(a, c):
        return np.asarray(a, np.float32) * (1 - b) + np.asarray(c, np.float32) * b
    sky_a = np.stack([rgb(10, 12, 30), rgb(14, 18, 42), rgb(20, 26, 56), rgb(28, 36, 72), rgb(40, 48, 88),
                      rgb(58, 62, 104), rgb(84, 76, 116)])
    sky_b = np.stack([rgb(8, 3, 8), rgb(16, 5, 12), rgb(30, 8, 18), rgb(52, 12, 24), rgb(84, 18, 28),
                      rgb(124, 28, 32), rgb(168, 46, 38)])
    lights_a = np.stack([rgb(36, 46, 92), rgb(58, 74, 128), rgb(88, 108, 160), rgb(128, 148, 190),
                         rgb(176, 192, 220), rgb(220, 228, 244)]) / 255.0 * 1.25
    lights_b = np.stack([rgb(26, 12, 26), rgb(54, 18, 32), rgb(98, 26, 36), rgb(156, 42, 40),
                         rgb(214, 80, 54), rgb(250, 140, 96)]) / 255.0 * 1.3
    moon_a = np.stack([rgb(150, 150, 150), rgb(186, 184, 176), rgb(214, 212, 200), rgb(236, 234, 222),
                       rgb(252, 250, 240)])
    moon_b = np.stack([rgb(70, 10, 16), rgb(110, 18, 22), rgb(150, 30, 28), rgb(190, 50, 38), rgb(226, 86, 60)])
    return dict(sky=mix(sky_a, sky_b), halo=mix(rgb(40, 46, 70), rgb(110, 20, 18)), star=rgb(230, 232, 255),
                rim=0.6 + 0.4 * b,
                moon_ramp=mix(moon_a, moon_b), light=mix(lights_a, lights_b), bands=6,
                direct=float(0.95 + 0.05 * b), ambient=float(0.42 - 0.04 * b), fog=mix(rgb(36, 44, 76), rgb(70, 18, 28)),
                water=mix(rgb(10, 16, 34), rgb(16, 4, 10)), dead_water=rgb(14, 10, 10), glint=mix(rgb(230, 236, 250),
                                                                                                     rgb(250, 120, 90)),
                ink=rgb(8, 8, 18), mist_col=mix(rgb(84, 96, 136), rgb(150, 40, 42)), cloud_dark=mix(rgb(30, 34, 60), rgb(40, 10, 18)),
                cloud_lit=mix(rgb(120, 126, 156), rgb(150, 50, 44)), blood=b)
