"""THE HUNGER - a giant made of roaches. A pixel-art film in a real 3D valley.

Night over the rice fields at the foot of the mountains, everything alive:
young rice in its rows, the moon in the flooded fields, fireflies, frogs.

One cockroach sits on a dike, cleaning its feelers. It turns and looks at you.

The water starts to boil: roaches come up out of it everywhere, and as they
feed on the rice it browns and slumps and they grow - from the length of a
finger to the length of a cart. They spread over the fields in a black tide,
and lights of life lift out of everything they touch. The moon goes red. Then
they turn and run back in, and climb each other, and build it: a man a hundred
and twenty metres tall, skinny past starving, with arms too long and a
beautiful face. They crawl off its face. It opens its eyes, and smiles.

It breathes in, and the valley dies in a ring round it. It walks - wrong,
loose, its spine swaying, its arms flopping and rippling, its head snapping
from angle to angle - and every step kills the ground under it and shakes the
trees, and roaches rain off it. It drinks the old pine dry and pushes it over.
It turns its face to you, and its smile keeps going, and its jaw comes off its
hinges, and they pour out. It reaches for you.

    python film.py out.mp4                 # the film, silent
    python film.py --still 3 9.5 30 ...    # test frames (seconds)
"""
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))
import hd2d as K                                                              # noqa: E402
import world as WD                                                            # noqa: E402
import valley as VL                                                           # noqa: E402
import creature as CR                                                         # noqa: E402
import physics as PH                                                          # noqa: E402
import roach2d as R2                                                          # noqa: E402
import timeline as TL                                                         # noqa: E402
from timeline import F, PINE, P_END, sm, kf, blood                            # noqa: E402
from terrain import dike_x, WATER, in_paddies                                 # noqa: E402
from raster3d import Camera                                                   # noqa: E402

AW, AH = K.W, K.H
W, H, FPS = 1280, 720, TL.FPS
BAR = 64
FONTS = '/usr/share/fonts/opentype/'
FACE_EYE = np.array([240.0, 108.0, 300.0])


# ---------------------------------------------------------------- life, drained
def feed_radius(t):
    """How far out the rice has been eaten (the swarm spreading as it feeds)."""
    return 6 + 175 * float(sm(TL.T_SURFACE + 0.5, 18.5, t)) ** 0.8


def make_dead(steps, pine_t):
    def dead_at(x, z, t):
        x = np.asarray(x, float)
        z = np.asarray(z, float)
        t = np.broadcast_to(np.asarray(t, float), x.shape)
        d0 = np.hypot(x - F[0], z - F[2])
        R = 6 + 175 * sm(TL.T_SURFACE + 0.5, 18.5, t) ** 0.8
        dead = np.clip((R - d0) / 14, 0, 1) * (t > TL.T_SURFACE)
        Rb = 181 + 300 * sm(TL.T_BREATH, TL.T_BREATH + 3.4, t)
        dead = np.maximum(dead, np.clip((Rb - d0) / 16, 0, 1) * (t > TL.T_BREATH))
        for (t0, foot, sx, sz) in steps:
            if np.all(t < t0):
                continue
            r = 60 * (1 - np.exp(-np.maximum(t - t0, 0) / 0.6))
            dead = np.maximum(dead, np.clip((r - np.hypot(x - sx, z - sz)) / 10, 0, 1) * (t >= t0))
        dp = sm(TL.T_DRINK[0], TL.T_DRINK[1], t)
        dead = np.maximum(dead, np.clip((46 * dp - np.hypot(x - PINE[0], z - PINE[2])) / 9, 0, 1))
        return dead
    return dead_at


def look(t, world):
    L = WD.look_night(blood(t))
    L['moon'] = world.moon
    L['key'] = world.key
    L['front'] = 1.0
    L['front_col'] = WD.rgb(150, 240, 200) * (1 - 0.5 * blood(t)) + WD.rgb(240, 120, 100) * 0.5 * blood(t)
    L['mist'] = 0.5 + 0.25 * blood(t)
    L['fill'] = 0.18
    return L


# ---------------------------------------------------------------- the film
class Film:
    def __init__(self):
        R2.ATLAS.load_or_build()
        hz = TL.HERO[2]
        hx = float(dike_x(6, hz))
        path = [(F[0] + (P_END[0] - F[0]) * u, F[2] + (P_END[2] - F[2]) * u) for u in np.linspace(0, 1, 9)]
        path.append((PINE[0], PINE[2]))
        self.v = VL.Valley(F, path, bare=np.array([hx, 0, hz]), bare_r=0.5)
        self.world = self.v.world
        self.land = self.v.land
        hy = float(self.v.ground_y(np.array([hx]), np.array([hz]))[0])
        self.hero = np.array([hx, hy + 0.004, hz])
        g = float(self.land.height(np.array([F[0] + 45]), np.array([F[2] - 85]))[0])
        self.rise_eye = np.array([F[0] + 45, max(g, WATER + 0.3) + 2.2, F[2] - 85])
        self.cr = CR.Creature(self.land, FACE_EYE, self.rise_eye)
        # the body's roaches: which climb in first (the lowest), and where they gather at its feet
        P0 = self.cr.pose(TL.T_FORM[1] + 0.1)
        Pb, _, _ = self.cr.roach_points(TL.T_FORM[1] + 0.1, P0, reveal=0.0)
        y = (Pb[:, 1] - Pb[:, 1].min()) / np.ptp(Pb[:, 1])
        r = np.random.RandomState(11)
        self.arrive = TL.T_FORM[0] + (TL.T_FORM[1] - TL.T_FORM[0]) * y + r.uniform(-0.3, 0.3, len(y))
        feet = Pb.copy()
        feet[:, 1] = 0
        feet[:, [0, 2]] = F[[0, 2]] + (Pb[:, [0, 2]] - F[[0, 2]]) * 0.6
        self.flock = PH.Flock(self.cr.swarm.n, self.arrive, feet)
        self.topple = PH.Topple(TL.T_TOPPLE)
        self.dead_at = make_dead(TL.STEPS, None)
        tr = self.v.trees
        ip = self.v.pine_index
        tr.override[ip] = lambda t: float(sm(TL.T_DRINK[0] + 0.4, TL.T_DRINK[1], t))
        fall = PINE - P_END
        fall[1] = 0
        fall /= np.linalg.norm(fall)
        tr.tilt_axis[ip] = np.cross([0, 1.0, 0], fall)
        tpos = tr.pos.copy()

        def tilt(t):
            a = PH.tree_shake(t, tpos, TL.STEPS)
            a[ip] = self.topple(t) + 0.08 * float(sm(TL.T_DRINK[0], TL.T_DRINK[0] + 1, t) *
                                                  (1 - sm(TL.T_DRINK[1], TL.T_TOPPLE, t)))
            return a
        tr.tilt = tilt
        self.world.extra.append(self._draw)
        self.dyn = K.ShadowMap((0, 0, 600), self.world.key, 260, 1024)
        self._death_times()
        self._motes()
        self._drips()
        r = np.random.RandomState(41)
        self.mouth = [(r.uniform(TL.T_JAW + 0.4, 61.6), r.normal(0, 2.4, 3), r.uniform(0, 6.3), r.uniform(1.6, 2.6))
                      for _ in range(420)]
        self.lens = [(r.uniform(60.3, 61.9), r.uniform(0, 2 * math.pi), r.uniform(0.3, 1.0), r.uniform(0, 6.3))
                     for _ in range(150)]
        r = np.random.RandomState(51)
        cx = np.r_[r.normal(self.hero[0], 25, 300), r.normal(F[0], 60, 300)]
        cz = np.r_[r.normal(self.hero[2], 25, 300), r.normal(F[2], 60, 300)]
        self.ff = np.stack([cx, np.maximum(self.land.height(cx, cz), WATER) + r.uniform(0.3, 2.5, len(cx)), cz], 1)
        self.ff_ph = r.uniform(0, 6.3, len(cx))
        self.events = [(t0, 0.55) for (t0, f_, x, z) in TL.STEPS] + [(TL.T_BREATH, 0.25), (self.topple.t_land, 0.4),
                                                                     (TL.T_EYES, 0.15), (TL.T_JAW, 0.2)]
        self.fonts = {}

    def _death_times(self):
        tr = self.v.trees
        td = np.full(tr.n, np.inf)
        for t in np.arange(9.0, 52.0, 0.1):
            d = tr.deadness(t, self.dead_at)
            hit = (d > 0.35) & ~np.isfinite(td)
            td[hit] = t
        self.tree_death = td

    def _motes(self):
        r = np.random.RandomState(31)
        M = []
        for k in range(1400):
            tb = r.uniform(TL.T_SURFACE + 1.5, TL.T_BREATH + 4.0)
            R = max(feed_radius(tb), (181 + 300 * float(sm(TL.T_BREATH, TL.T_BREATH + 3.4, tb))) if tb > TL.T_BREATH
                    else 0)
            a = r.uniform(0, 2 * math.pi)
            rr = R * r.uniform(0.8, 1.0)
            M.append((tb, F[0] + math.cos(a) * rr, F[2] + math.sin(a) * rr, r.uniform(2.2, 3.8), r.uniform(0, 6.3), 0))
        for (t0, f_, x, z) in TL.STEPS:
            for _ in range(12):
                M.append((t0 + r.uniform(0.2, 1.4), x + r.normal(0, 24), z + r.normal(0, 24), r.uniform(1.4, 2.6),
                          r.uniform(0, 6.3), 0))
        for k in range(700):
            M.append((r.uniform(TL.T_DRINK[0], TL.T_DRINK[1] + 0.5), PINE[0] + r.normal(0, 5), PINE[2] + r.normal(0, 5),
                      r.uniform(0.9, 1.6), r.uniform(0, 6.3), 1))
        M.sort(key=lambda m: m[0])
        self.M = np.array([m[:5] for m in M])
        self.Mk = np.array([m[5] for m in M])
        self.My = np.where(self.Mk == 1, r.uniform(2, 28, len(M)), r.uniform(0.3, 2.0, len(M)))

    def _drips(self):
        """Roaches dropping off it as it walks: from where on its body, and when."""
        r = np.random.RandomState(21)
        n = 900
        t0 = np.sort(r.uniform(TL.T_WALK + 0.3, 61.0, n))
        tq = np.round(t0 * 4) / 4
        idx = r.randint(0, self.cr.swarm.n, n)
        start = np.zeros((n, 3))
        for tt in np.unique(tq):
            P = self.cr.pose(float(tt))
            Pw, _, _ = self.cr.roach_points(float(tt), P)
            sel = tq == tt
            start[sel] = Pw[idx[sel]]
        self.drip_t, self.drip_p = t0, start
        self.drip_a = r.uniform(0, 2 * math.pi, n)
        self.drip_v = r.uniform(5, 13, n)
        self.drip_L = r.uniform(1.6, 2.6, n)
        self.drip_ph = r.uniform(0, 6.3, n)
        self.drip_spin = r.normal(0, 7, (n, 3))

    # -------------------------------------------------------------- cameras
    def camera(self, name, t):
        """(eye, target, fov, focus distance, blur)."""
        hp = self.hero
        if name == 'paddy':
            a = float(kf(t, [(0, 3.75), (8.5, 4.35)]))
            rad = float(kf(t, [(0, 0.36), (6, 0.25), (8.5, 0.3)]))
            eye = hp + np.array([math.cos(a) * rad, float(kf(t, [(0, 0.16), (8.5, 0.13)])), math.sin(a) * rad])
            tgt = self.hero_pos(t) + np.array([0, 0.01, 0])
            return eye, tgt, 44, float(np.linalg.norm(tgt - eye)), 4.0
        if name == 'rising':
            eye = hp + kf(t, [(8.5, (-5, 1.2, -9)), (13.5, (-11, 4.0, -19))])
            tgt = F + kf(t, [(8.5, (0, 0, 0)), (13.5, (0, 2, 20))])
            return eye, tgt, 50, float(kf(t, [(8.5, 12), (13.5, 40)])), 0.7
        if name == 'tide':
            eye = F + kf(t, [(13.5, (-125, 24, -160)), (19.5, (-118, 32, -150))])
            return eye, F + np.array([0, 0, 40.0]), 52, 200, 0.3
        if name == 'rise':
            eye = self.rise_eye + kf(t, [(19.5, (0, 0, 0)), (28.5, (-3, 0.6, 4))])
            tgt = F + kf(t, [(19.5, (0, 6, 0)), (23, (0, 22, 0)), (26.5, (0, 50, 0)), (28.5, (0, 66, 0))])
            return eye, tgt, 78, 95, 0.4
        if name == 'breath':
            eye = F + kf(t, [(28.5, (-270, 36, -320)), (33.5, (-292, 31, -338))])
            return eye, F + kf(t, [(28.5, (0, 70, 0)), (33.5, (0, 64, 0))]), 46, 450, 0.35
        P = self.cr.pose(min(t, 61.9))
        fr = P['fr']
        if name == 'walk':
            pos = fr['pelvis'].copy()
            d = (P_END - F) / np.linalg.norm(P_END - F)
            side = np.array([d[2], 0, -d[0]])
            eye = pos - side * 140 + d * 55
            eye[1] = max(float(self.land.height(eye[[0]], eye[[2]])[0]), WATER) + 7
            tgt = pos + np.array([0, -8.0, 0])
            return eye, tgt, 54, float(np.linalg.norm(tgt - eye)), 0.9
        if name == 'walk_low':
            d = (P_END - F) / np.linalg.norm(P_END - F)
            side = np.array([d[2], 0, -d[0]])
            eye = P_END + d * 55 + side * 24                              # ahead of it: it comes at you
            eye[1] = max(float(self.land.height(eye[[0]], eye[[2]])[0]), WATER) + 2.5
            tgt = fr['pelvis'] + np.array([0, 4.0, 0])
            return eye, tgt, 70, float(np.linalg.norm(fr['pelvis'] - eye)), 0.5
        if name == 'pine':
            eye = kf(t, [(43, (166, 2.6, 196)), (51, (172, 2.4, 202))])
            tgt = kf(t, [(43, (212, 52, 300)), (45.5, (226, 30, 268)), (51, (232, 18, 262))])
            return eye, tgt, 62, float(kf(t, [(43, 110), (45.5, 92), (51, 85)])), 0.8
        if name in ('face', 'reach'):
            head = P['head']
            to = head - FACE_EYE
            push = float(sm(51, 58, t)) * 6
            eye = FACE_EYE + to / np.linalg.norm(to) * push
            tgt = head + np.array([0, -2.0, 0])
            focus = float(np.linalg.norm(tgt - eye))
            if name == 'reach':
                hand = fr['armR'][-1]
                focus = max(2.0, float(np.linalg.norm(hand - eye)) - 2)
            return eye, tgt, 40, focus, 1.6
        return np.array([0, 10, 0.0]), np.array([0, 10, 100.0]), 50, 100, 0.0

    def shake(self, t, name):
        k = {'paddy': 0.0, 'rising': 0.05, 'tide': 0.4, 'rise': 0.6, 'breath': 1.2, 'walk': 1.6, 'walk_low': 2.4,
             'pine': 1.0, 'face': 0.6, 'reach': 1.0}.get(name, 0.0)
        return PH.camera_shake(t, self.events) * k

    # -------------------------------------------------------------- the first roach
    def hero_pos(self, t):
        """It sits, cleans its feelers, turns to look at you; then it runs."""
        run = float(sm(7.2, 8.6, t))
        return self.hero + np.array([0.51, 0, 0.86]) * 0.7 * run ** 1.5

    def hero_heading(self, t):
        a = float(kf(t, [(0, 0.6), (TL.T_HERO_TURN, 0.6), (TL.T_HERO_TURN + 0.45, 4.17 - 2 * math.pi), (7.2, 4.17 - 2 *
                                                                                                         math.pi),
                         (7.55, 1.03)]))
        a += 0.08 * math.sin(t * 7) * float(t < TL.T_HERO_TURN)
        return np.array([math.cos(a), 0, math.sin(a)])

    # -------------------------------------------------------------- what moves, drawn into the g-buffer
    def _draw(self, g, cam, t, ctx, mirror):
        if mirror:
            return
        st = self.state
        name = st['name']
        land = self.land
        if t < 9.0:                                                        # the first one
            ph = t * (2.0 if t < 7.2 else 14.0)
            R2.draw(g, cam, self.hero_pos(t)[None] + np.array([0, 0.006, 0]), np.array([[0, 1.0, 0]]),
                    self.hero_heading(t)[None], np.array([0.065]), np.array([ph]), 41000000, hero=0, dim=0.9, tol=0.05)
        if TL.T_SURFACE - 0.5 <= t < TL.T_FORM[1] + 0.8:                    # the swarm
            X, Z, Hd, D = self.flock.at(t)
            fl = self.flock
            on = (t >= fl.t_out) & (t < fl.arrive - 1.3)
            on[0] &= t >= 8.6
            if on.any():
                i = np.where(on)[0]
                L = fl.size(t)[i]
                y = np.maximum(self.v.ground_y(X[i], Z[i]), WATER) + 0.02
                rise = np.clip((t - fl.t_out[i]) * 2.0, 0, 1)
                y = y - (1 - rise) * L * 0.5
                P = np.stack([X[i], y, Z[i]], 1)
                Hv = np.stack([np.cos(Hd[i]), np.zeros(len(i)), np.sin(Hd[i])], 1)
                R2.draw(g, cam, P, np.tile([0, 1.0, 0], (len(i), 1)), Hv, L, D[i] / np.maximum(L, 0.05) * 1.6, 42000000,
                        ids=i, tol=0.3, dim=0.6)
        if 'P' in st:                                                      # the creature
            P = st['P']
            fill = (t - TL.T_FORM[0] + 0.3) / (TL.T_FORM[1] - TL.T_FORM[0]) if t < TL.T_FORM[1] + 1 else 2.0
            ground = arrive = None
            if t < TL.T_FORM[1] + 0.6:
                X, Z, Hd, D = self.flock.at(t)
                nb = self.cr.swarm.n
                ground = np.stack([X[:nb], np.maximum(self.v.ground_y(X[:nb], Z[:nb]), WATER), Z[:nb]], 1)
                arrive = self.arrive
            self.cr.draw(g, cam, t, P, fill=fill, ground_pts=ground, arrive=arrive)
        if t > TL.T_WALK:                                                  # dropping off it, tumbling, bouncing
            a = t - self.drip_t
            live = (a >= 0) & (a < 5.0)
            if live.any():
                i = np.where(live)[0]
                aa = a[i]
                p0 = self.drip_p[i]
                gy = np.maximum(self.land.height(p0[:, 0], p0[:, 2]), WATER)
                h0 = np.maximum(p0[:, 1] - gy, 0.1)
                tf = np.sqrt(2 * h0 / 9.8)
                v_hit = 9.8 * tf
                fall = np.minimum(aa, tf)
                dirv = np.stack([np.cos(self.drip_a[i]), np.zeros(len(i)), np.sin(self.drip_a[i])], 1)
                p = p0 + dirv * (3 * fall)[:, None] + np.array([0, 1.0, 0]) * (-0.5 * 9.8 * fall * fall)[:, None]
                b = np.maximum(aa - tf, 0)                                 # one bounce, then it runs
                vb = v_hit * 0.22
                tb = 2 * vb / 9.8
                hop = np.where(b < tb, vb * b - 0.5 * 9.8 * b * b, 0)
                run = np.maximum(b - tb, 0)
                p = p + dirv * (self.drip_v[i] * run + 3 * np.minimum(b, tb))[:, None]
                p[:, 1] = np.where(aa > tf, np.maximum(self.land.height(p[:, 0], p[:, 2]), WATER) + 0.05 + hop, p[:, 1])
                air = aa < tf + tb
                spin = self.drip_spin[i] * aa[:, None]
                hd = np.where(air[:, None], np.stack([np.cos(spin[:, 0]), np.sin(spin[:, 1]), np.sin(spin[:, 0])], 1),
                              dirv)
                nrm = np.where(air[:, None], np.stack([np.sin(spin[:, 2]), np.cos(spin[:, 2]), 0 * aa], 1),
                               np.array([0, 1.0, 0]))
                R2.draw(g, cam, p, nrm, hd, self.drip_L[i], aa * 11 + self.drip_ph[i], 43000000, ids=i)
        if t >= TL.T_JAW + 0.4 and 'P' in st:                              # pouring out of its mouth
            P = st['P']
            Rh, head = P['Rh'], P['head']
            mouth = head + Rh @ np.array([0, -0.07, 0.1]) * CR.HEAD_S
            fwd = Rh @ np.array([0, -0.2, 1.0])
            pts, hds, Ls, phs = [], [], [], []
            for (t0, v0, a0, Lr) in self.mouth:
                a = t - t0
                if 0 <= a < 3.5:
                    vel = fwd * 8 + v0
                    p = mouth + vel * a + np.array([0, -0.5 * 9.8 * a * a, 0])
                    if p[1] > float(land.height(p[[0]], p[[2]])[0]) + 0.3:
                        pts.append(p)
                        hds.append(vel + np.array([0, -9.8 * a, 0]) + np.array([math.cos(a * 8 + a0), 0, math.sin(a * 8)]))
                        Ls.append(Lr)
                        phs.append(a * 12 + a0)
            if pts:
                hds = np.array(hds)
                R2.draw(g, cam, np.array(pts), np.cross(hds, np.array([0.3, 0.2, 1.0])), hds, np.array(Ls),
                        np.array(phs), 44000000)
        if name == 'reach':                                               # over the lens
            fwd, up, right = cam.R[2], cam.R[1], cam.R[0]
            pts, hds, nrms, phs = [], [], [], []
            for (t0, a0, dist, ph) in self.lens:
                a = t - t0
                if a < 0:
                    continue
                rr = 1.25 * (1 - dist * min(1.0, a * 1.3))
                pts.append(cam.eye + fwd * 1.0 + (right * math.cos(a0) * 1.78 + up * math.sin(a0)) * rr * 0.5)
                hds.append(-(right * math.cos(a0) * 1.78 + up * math.sin(a0)) + right * 0.3 * math.sin(ph + a * 6))
                nrms.append(-fwd)
                phs.append(a * 12 + ph)
            if pts:
                R2.draw(g, cam, np.array(pts), np.array(nrms), np.array(hds), np.full(len(pts), 0.3), np.array(phs),
                        45000000)
        tr = self.v.trees                                                  # leaves falling from the dying trees
        a = t - self.tree_death
        dying = np.where((a > 0) & (a < 6))[0]
        if len(dying):
            dying = dying[np.linalg.norm(tr.pos[dying] - cam.eye, axis=1) < 500]
        if len(dying):
            k = 14
            ti = np.repeat(dying, k)
            aa = np.repeat(t - self.tree_death[dying], k) - np.tile(np.linspace(0, 2.4, k), len(dying))
            jj = np.tile(np.arange(k), len(dying))
            ok = aa > 0
            ti, aa, jj = ti[ok], aa[ok], jj[ok]
            if len(ti):
                hsh = (ti * 7919 + jj * 104729) % 1000 / 1000.0
                h0 = tr.H[ti] * (0.4 + 0.5 * hsh)
                ang = hsh * 40
                rad = tr.H[ti] * 0.25 * ((hsh * 13) % 1)
                fall = np.minimum(aa * 1.8, h0)                           # drifting down, side to side
                p = tr.pos[ti] + np.stack([np.cos(ang) * rad + np.sin(aa * 2.6 + ang) * 1.2 + aa * 1.2,
                                           h0 - fall, np.sin(ang) * rad + np.cos(aa * 2.2 + ang) * 1.2], 1)
                sz = np.full(len(ti), 0.3)
                K.draw_ellipsoids(g, cam, p, np.stack([sz, sz * 0.12, sz * 0.7], 1), WD.LEAF,
                                  9100000 + np.arange(len(ti)), tr.kind[ti] + hsh * 0.99,
                                  aux=np.full(len(ti), 0.6, np.float32))
        for (t0, foot, x, z) in TL.STEPS:                                   # clods kicked up by each footfall
            a = t - t0
            if 0 <= a < 2.5:
                r = np.random.RandomState(int(t0 * 100))
                n = 40
                v0 = r.uniform(4, 13, n)
                ang = r.uniform(0, 2 * math.pi, n)
                up = r.uniform(6, 16, n)
                gy = max(float(self.land.height(np.array([x]), np.array([z]))[0]), WATER)
                tt = np.minimum(a, 2 * up / 9.8)
                p = np.stack([x + np.cos(ang) * v0 * tt, gy + np.maximum(up * tt - 0.5 * 9.8 * tt * tt, 0),
                              z + np.sin(ang) * v0 * tt], 1)
                rr = r.uniform(0.25, 0.8, n)
                K.draw_ellipsoids(g, cam, p, np.stack([rr, rr * 0.7, rr], 1), WD.ROCK,
                                  7900000 + np.arange(n), np.full(n, 0.1, np.float32))

    # -------------------------------------------------------------- one frame
    def frame(self, fi):
        t = fi / FPS
        name, t0, t1 = next((s for s in TL.SHOTS if s[1] <= t < s[2]), TL.SHOTS[-1])
        if name == 'title':
            return self.finish(dict(img=np.zeros((AH, AW, 3), np.float32), depth=np.full((AH, AW), 1e9), focus=1,
                                    blur=0, glows=[], name=name, dust=[]), t, fi)
        return self.finish(self.shot(name, t), t, fi)

    def shot(self, name, t):
        eye, tgt, fov, focus, blur = self.camera(name, t)
        eye = eye + self.shake(t, name)
        cam = Camera(eye, tgt, fov, AW, AH)
        L = look(t, self.world)
        st = dict(name=name)
        if t >= TL.T_FORM[0] - 0.6:
            st['P'] = self.cr.pose(min(t, 61.9))
        self.state = st
        ctx = self.v.ctx(dead=lambda x, z: self.dead_at(x, z, t), dead_t=self.dead_at)
        ctx['rice_near'] = 40.0
        if TL.T_SURFACE - 0.3 < t < 16:                                    # rings on the water where they come up
            fl = self.flock
            age = t - fl.t_out
            new = np.where((age > 0) & (age < 1.4))[0]
            if len(new):
                d = np.hypot(fl.x0[new] - cam.eye[0], fl.z0[new] - cam.eye[2])
                new = new[np.argsort(d)][:250]
                sz = fl.size(t)[new]
                ctx['ripples'] = [(fl.x0[j], fl.z0[j], age[j], float(s)) for j, s in zip(new, sz)]
        if 'P' in st:                                                      # its shadow
            P = st['P']
            self.dyn.recentre(P['fr']['pelvis'] + np.array([0, 20.0, 0]), self.world.key, 200)
            fill = (t - TL.T_FORM[0] + 0.3) / (TL.T_FORM[1] - TL.T_FORM[0]) if t < TL.T_FORM[1] + 1 else 2.0
            self.cr.draw(self.dyn.g, self.dyn.cam, t, P, fill=fill, shadow=True)
            ctx['dyn_shadow'] = self.dyn
        img, g, light = self.world.render(cam, t, L, ctx)
        glows = self.glows(cam, g, t, st)
        return dict(img=img, depth=g.depth, focus=focus, blur=blur, glows=glows, name=name, cam=cam, mat=g.mat,
                    var=g.var, dust=self.dust(cam, g, t))

    def dust(self, cam, g, t):
        """Puffs of dust where its feet come down (soft, drawn over the frame)."""
        out = []
        for (t0, foot, x, z) in TL.STEPS:
            a = t - t0
            if 0 <= a < 3.0:
                gy = max(float(self.land.height(np.array([x]), np.array([z]))[0]), WATER)
                r = np.random.RandomState(int(t0 * 77))
                for k in range(26):
                    ang = r.uniform(0, 2 * math.pi)
                    sp = r.uniform(4, 14)
                    p = np.array([x + math.cos(ang) * sp * a ** 0.6 * 1.6, gy + 1 + r.uniform(1, 6) * a ** 0.5,
                                  z + math.sin(ang) * sp * a ** 0.6 * 1.6])
                    sx, sy, sz = cam.project(p[None])
                    if sz[0] <= 1:
                        continue
                    xi, yi = int(sx[0]), int(sy[0])
                    if 0 <= xi < AW and 0 <= yi < AH and np.linalg.norm(p - cam.eye) < g.depth[yi, xi] + 5:
                        rad = (3 + 9 * a) * cam.focal / sz[0]
                        out.append((sx[0], sy[0], rad * 0.7, (1 - a / 3.0) ** 1.5 * 0.16))
        return out

    def glows(self, cam, g, t, st):
        out = []
        a = (t - self.M[:, 0]) / self.M[:, 3]
        live = (a >= 0) & (a <= 1)
        if live.any():
            i = np.where(live)[0]
            o = np.stack([self.M[i, 1], self.My[i], self.M[i, 2]], 1)
            o[:, 1] += np.maximum(self.land.height(o[:, 0], o[:, 2]), WATER)
            if 'P' in st:
                P = st['P']
                mouth = P['head'] + P['Rh'] @ np.array([0, -0.06, 0.1]) * CR.HEAD_S
                chest = P['fr']['spine'][4]
                hand = P['fr']['armR'][-1]
                tgt = np.where((self.Mk[i] == 1)[:, None], hand, mouth if t > TL.T_BREATH - 0.3 else chest)
            else:
                tgt = np.tile(F + np.array([0, 1.0, 0]), (len(i), 1))
            ph = self.M[i, 4]

            def where(aa):
                e = np.clip(aa, 0, 1) ** 2.6
                swirl = np.stack([np.sin(ph + aa * 9), np.zeros(len(aa)), np.cos(ph + aa * 7)], 1) * \
                    (2.5 * (1 - e))[:, None]
                up = np.array([0, 1.0, 0]) * (3.0 * np.sqrt(np.clip(aa, 0, 1)))[:, None]
                return o * (1 - e[:, None]) + tgt * e[:, None] + (swirl + up) * (1 - e[:, None])
            p = where(a[i])
            p_prev = where(a[i] - 0.12 / self.M[i, 3])
            k = np.clip(np.sin(math.pi * a[i]) * 1.6, 0, 1)
            out.append((p, k, np.array([190, 255, 200.0]), p_prev))
        if t < 20:                                                      # fireflies, until the drain reaches them
            ff = self.ff + np.stack([np.sin(t * 0.7 + self.ff_ph) * 1.5, np.sin(t * 1.1 + self.ff_ph * 2) * 0.4,
                                     np.cos(t * 0.6 + self.ff_ph) * 1.5], 1)
            dd = self.dead_at(ff[:, 0], ff[:, 2], t)
            blink = np.clip(np.sin(t * 2.3 + self.ff_ph * 3), 0, 1) ** 3 * (1 - dd)
            ok = blink > 0.05
            if ok.any():
                out.append((ff[ok], blink[ok], np.array([90, 255, 220.0]), ff[ok]))
        pts = []
        for (p, k, c, pp) in out:
            x, y, z = cam.project(p)
            x0, y0, z0 = cam.project(pp)
            d = np.linalg.norm(p - cam.eye, axis=1)
            xi, yi = x.astype(int), y.astype(int)
            ok = (xi >= 0) & (xi < AW) & (yi >= 0) & (yi < AH) & (z > 0.5) & (z0 > 0.5)
            ok[ok] &= d[ok] < g.depth[yi[ok], xi[ok]] + 2
            for j in np.where(ok)[0]:
                pts.append((x[j], y[j], float(k[j]), c, float(np.clip(30 / d[j], 0.6, 3.0)), x0[j], y0[j]))
        return pts

    # -------------------------------------------------------------- finishing
    def finish(self, fr, t, fi):
        img = np.repeat(np.repeat(fr['img'], 2, 0), 2, 1).astype(np.float32) * (1 + 0.2 * blood(t))
        for (x, y, rad, a) in fr.get('dust', []):                       # dust in the air
            ov = img.copy()
            cv2.circle(ov, (int(x * 2), int(y * 2)), max(1, int(rad * 2)), (52, 50, 70), -1)
            img = img * (1 - a) + ov * a
        if fr['blur'] > 0:                                              # depth of field
            z = np.repeat(np.repeat(np.minimum(fr['depth'], 1e6), 2, 0), 2, 1)
            coc = np.clip(np.abs(1 / np.maximum(z, 0.05) - 1 / fr['focus']) * fr['focus'] * fr['blur'] * 2.4, 0, 9)
            stops = np.array([0, 1.4, 3.0, 5.2, 9.0])
            levels = [img] + [cv2.GaussianBlur(img, (0, 0), s) for s in stops[1:]]
            k = np.clip(np.searchsorted(stops, coc) - 1, 0, 3)
            w = ((coc - stops[k]) / (stops[k + 1] - stops[k]))[..., None]
            out = np.zeros_like(img)
            for i in range(4):
                sel = (k == i)[..., None]
                out = np.where(sel, levels[i] * (1 - w) + levels[i + 1] * w, out)
            img = out
        gcol = np.zeros((H, W, 3), np.float32)
        for (x, y, k, c, s, xp, yp) in fr['glows']:
            X, Y = int(x * 2), int(y * 2)
            Xp, Yp = int(xp * 2), int(yp * 2)
            r = max(1, int(round(s)))
            col = tuple(float(v) * k for v in c)
            ln = math.hypot(Xp - X, Yp - Y)
            if 2 < ln < 400:
                if ln > 26:
                    Xp = int(X + (Xp - X) * 26 / ln)
                    Yp = int(Y + (Yp - Y) * 26 / ln)
                cv2.line(img, (Xp, Yp), (X, Y), tuple(v * 0.35 for v in col), 1)
                cv2.line(gcol, (Xp, Yp), (X, Y), tuple(v * 0.6 for v in col), r)
            cv2.rectangle(img, (X - r // 2, Y - r // 2), (X + r // 2, Y + r // 2), col, -1)
            cv2.circle(gcol, (X, Y), r * 3, col, -1)
        if fr['glows']:
            img += cv2.GaussianBlur(gcol, (0, 0), 6) * 0.45
        b = cv2.GaussianBlur(np.clip(img - 150, 0, 255), (0, 0), 9)     # bloom
        img = img + b * 0.8
        if 'mat' in fr:                                                 # the eyes burn through everything
            em = ((fr['mat'] == WD.EYE) & (fr['var'] > 0.05)).astype(np.float32)
            if em.any():
                em = np.repeat(np.repeat(em, 2, 0), 2, 1)
                gl = cv2.GaussianBlur(em, (0, 0), 7) + cv2.GaussianBlur(em, (0, 0), 22) * 0.6
                img += gl[..., None] * np.array([30, 50, 255.0]) * 1.6
        if fr['name'] == 'title':
            img = self.draw_title(img, t)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        img = img * (1 - 0.24 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2))[..., None]
        img = img + np.random.RandomState(fi).normal(0, 0.8, (H, W, 1))
        fade = float(sm(0, 2.2, t) * (1 - sm(TL.END - 1.4, TL.END - 0.1, t)))
        if TL.T_CUT <= t < 62.0:
            fade = 0.0
        img = img * fade
        img[:BAR] = 0
        img[H - BAR:] = 0
        return np.clip(img, 0, 255).astype(np.uint8)

    def text(self, key, s, size, font):
        if key not in self.fonts:
            f = ImageFont.truetype(font, size)
            im = Image.new('L', (W, int(size * 1.6)), 0)
            d = ImageDraw.Draw(im)
            d.text(((W - d.textlength(s, font=f)) / 2, size * 0.2), s, font=f, fill=255)
            self.fonts[key] = np.asarray(im, np.float32) / 255
        return self.fonts[key]

    def draw_title(self, img, t):
        t0 = 62.0
        jp = self.text('jp', '餓鬼', 96, FONTS + 'ipafont-gothic/ipagp.ttf')
        en = self.text('en', 'T H E   H U N G E R', 30, FONTS + 'inter/Inter-Light.otf')
        for m, y, col, k in ((jp, 250, (34, 26, 200), float(sm(t0 + 0.6, t0 + 2.0, t))),
                             (en, 400, (200, 200, 230), float(sm(t0 + 1.8, t0 + 3.0, t)))):
            al = m[..., None] * k
            g = cv2.GaussianBlur(m, (0, 0), 10)[..., None] * k * 0.6
            img[y:y + m.shape[0]] = img[y:y + m.shape[0]] * (1 - al) + np.array(col, np.float32) * (al + g)
        return img


_FILM = None


def _init():
    global _FILM
    _FILM = Film()


def _frame(i):
    return _FILM.frame(i).tobytes()


def render(out, workers=4, a=0, b=None, crf=17):
    n = int(TL.END * FPS)
    b = n if b is None else b
    Film()                                                                # builds the caches once
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s',
                           '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf',
                           str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    with Pool(workers, initializer=_init) as pool:
        for k, fr in enumerate(pool.imap(_frame, range(a, b), chunksize=1)):
            ff.stdin.write(fr)
            if k % 60 == 0:
                print('frame', a + k, '/', b, flush=True)
    ff.stdin.close()
    ff.wait()


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--still':
        f = Film()
        for s in args[1:]:
            cv2.imwrite('still_%s.png' % s, f.frame(int(round(float(s) * FPS))))
    else:
        render(args[0] if args else 'the_hunger.mp4')
