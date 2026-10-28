"""THE HUNGER - a giant made of roaches. A pixel-art film in a real 3D valley.

Night over the valley, everything alive: fireflies over the lake, spider
lilies in the grass, the old pine on the rise. The ground splits. One roach
the size of a cart pulls itself out of the crack, feeling the air - then a
hundred, then a black tide of thousands pouring across the meadow, and where
it runs the grass dries and bleaches and the lights of life lift out of it
and are pulled into the crack. The moon goes red. The tide turns, runs back,
and climbs itself: feet, legs, a body, arms, a head - a gaunt man a hundred
metres tall, made of roaches crawling over each other. Its eyes catch fire.
It breathes in, and the valley dies in a ring round it. It walks, and every
step kills the ground under it; roaches rain off it. It lays a hand on the
old pine and drinks it until the pine is grey. It turns its face to you. Its
mouth opens and they pour out. It reaches for you.

    python film.py out.mp4                 # the film, silent
    python film.py --still 9 15 24 ...     # test frames (seconds)
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
import swarm as SW                                                            # noqa: E402
from swarm import G, GS                                                       # noqa: E402
from raster3d import Camera, rot                                              # noqa: E402

AW, AH = K.W, K.H
W, H, FPS = 1280, 720, 30
BAR = 64
FONTS = '/usr/share/fonts/opentype/'
F = np.array([0.0, 0.0, 600.0])          # where the crack opens and it rises
PINE = np.array([230.0, 0.0, 260.0])
P_END = np.array([196.0, 0.0, 318.0])
SHOTS = [('valley', 0.0, 7.5), ('crack', 7.5, 13.0), ('tide', 13.0, 19.0), ('rise', 19.0, 28.5),
         ('stand', 28.5, 33.5), ('walk', 33.5, 43.0), ('pine', 43.0, 51.0), ('face', 51.0, 58.0),
         ('reach', 58.0, 62.0), ('title', 62.0, 68.0)]
END = SHOTS[-1][2]
T_CRACK, T_HERO, T_POUR = 8.2, 9.0, 10.6
T_FORM = (20.0, 27.0)
T_EYES, T_BREATH = 27.6, 29.6
T_WALK = 33.5
T_STOP = 42.6
T_DRINK = (45.6, 48.6)
T_JAW = 54.2


def sm(a, b, t):
    u = np.clip((np.asarray(t, float) - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def kf(t, keys):
    """Eased keyframes [(time, value), ...]."""
    if t <= keys[0][0]:
        return np.asarray(keys[0][1], float)
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = float(sm(t0, t1, t))
            return np.asarray(v0, float) * (1 - u) + np.asarray(v1, float) * u
    return np.asarray(keys[-1][1], float)


def blood(t):
    return float(kf(t, [(12.0, 0.0), (19.0, 0.4), (28.0, 0.85), (31.0, 1.0)]))


# ---------------------------------------------------------------- where the giant is, and how it stands
def walk_track(t):
    a = float(sm(T_WALK, T_STOP, t))
    d = P_END - F
    pos = F + d * a
    head_to = math.atan2(d[0], d[2])
    face_pine = math.atan2(PINE[0] - P_END[0], PINE[2] - P_END[2])
    yaw = float(kf(t, [(T_WALK, math.pi), (T_WALK + 1.8, head_to), (T_STOP, head_to), (44.4, face_pine + 0.3)]))
    return pos, yaw


def giant_state(t, land=None):
    """(pose, root position, yaw): slow, heavy, wrong."""
    if t < T_WALK:
        wake = float(sm(T_EYES - 0.6, T_EYES + 1.6, t))
        br = float(sm(T_BREATH, T_BREATH + 1.4, t) * (1 - sm(T_BREATH + 2.6, T_BREATH + 3.8, t)))
        P = dict(pelvis=(0, 1.1 + 0.05 * wake, 0), lean=0.9 - 0.5 * wake - 0.1 * br,
                 head=(0.06 * math.sin(t * 0.4), 0.6 * (1 - wake) - 0.4 * br, 0.05 * math.sin(t * 0.3)),
                 jaw=0.05 + 0.8 * br, t=t, curlL=0.6 - 0.45 * br, curlR=0.6 - 0.45 * br)
        if br > 0:
            P['handL'] = tuple(np.array([-0.36, 0.3, 0.25]) * (1 - br) + np.array([-0.9, 1.0, 0.3]) * br)
            P['handR'] = tuple(np.array([0.36, 0.3, 0.25]) * (1 - br) + np.array([0.9, 1.0, 0.3]) * br)
        pos, yaw = F.copy(), math.pi
    elif t < T_STOP:
        pos, yaw = walk_track(t)
        dist = float(np.linalg.norm(pos - F))
        ph = 2 * math.pi * dist / (2 * 0.6 * GS * 0.95)
        stop = float(sm(T_STOP - 0.8, T_STOP, t))
        P = G.walk(t, ph, head=(0.1 * math.sin(t * 0.5), 0.05, 0.04 * math.sin(t * 0.7)), jaw=0.08, lean=0.5,
                   stride=0.6 * (1 - stop))
    else:
        pos, yaw = walk_track(t)
        reach = float(sm(44.2, 45.6, t) * (1 - sm(49.4, 50.8, t)))
        P = dict(lean=0.55 + 0.2 * reach, head=(0.1 * math.sin(t * 0.4), 0.3 * reach, 0.0), t=t, jaw=0.1,
                 curlR=0.2 + 0.55 * float(sm(T_DRINK[0], T_DRINK[0] + 0.5, t)), curlL=0.45)
        if reach > 0:
            tgt = PINE + np.array([0, 24.0, 0])
            local = rot((0, 1, 0), -yaw) @ (tgt - pos) / GS
            P['handR'] = tuple(np.array([0.36, 0.3, 0.25]) * (1 - reach) + local * reach)
        if t >= 51.0:                                                 # its face, turning to you
            turn = float(sm(51.4, 53.8, t))
            jaw = float(sm(T_JAW, T_JAW + 0.9, t)) * 0.95
            P.update(head=(0.6 * (1 - turn) + 0.04 * math.sin(t * 0.6), -0.08 + 0.1 * turn, 0.07 * math.sin(t * 0.5)),
                     jaw=0.08 + jaw, lean=0.55)
            P.pop('handR', None)
        if t >= 58.0:                                                 # and reaches for you
            r = float(sm(58.2, 61.5, t))
            local = rot((0, 1, 0), -yaw) @ (FACE_EYE + np.array([0, -3.0, 0]) - pos) / GS
            P['handR'] = tuple(np.array([0.36, 0.3, 0.25]) * (1 - r) + local * r)
            P['curlR'] = 0.15 + 0.6 * float(sm(61.0, 61.9, t))
            P['jaw'] = 0.95
    if land is not None:
        pos = pos.copy()
        pos[1] = float(land.height(pos[[0]], pos[[2]])[0])
    return P, pos, yaw


def _face_eye():
    pos, yaw = walk_track(52.5)
    J = G.pose(lean=0.55, head=(0, 0, 0), t=52.5)
    head = G.place(J['head'][None], pos, yaw, GS)[0]
    fwd = np.array([math.sin(yaw), 0, math.cos(yaw)])
    side = np.cross(fwd, [0, 1, 0])
    return head + fwd * 34 + np.array([0, -5.0, 0]) + side * 5, head


FACE_EYE, FACE_HEAD = _face_eye()


# ---------------------------------------------------------------- life, drained
def steps():
    out = []
    d = P_END - F
    n = int(np.linalg.norm(d) / (0.6 * GS * 0.95))
    ts = np.linspace(T_WALK, T_STOP, 400)
    a = sm(T_WALK, T_STOP, ts)
    perp = np.array([-d[2], 0, d[0]]) / np.linalg.norm(d)
    for k in range(1, n + 1):
        u = k / n
        t0 = float(np.interp(u, a, ts))
        p = F + d * u + perp * (1 if k % 2 else -1) * 8
        out.append((p[0], p[2], t0))
    return out


STEPS = steps()


def tide_front(t):
    a = np.clip((np.asarray(t, float) - T_POUR) * 0.16, 0, 1)
    return 228 * (1 - (1 - a) ** 2.2)


def dead_at(x, z, t):
    """How dead the land is at (x, z) at time t (t may be an array)."""
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    t = np.broadcast_to(np.asarray(t, float), x.shape)
    d0 = np.hypot(x - F[0], z - F[2])
    dead = np.clip((tide_front(t) - d0 - 4) / 12, 0, 1) * (t > T_POUR)
    Rb = 228 + 270 * sm(T_BREATH, T_BREATH + 3.4, t)
    dead = np.maximum(dead, np.clip((Rb - d0) / 16, 0, 1) * (t > T_BREATH))
    for (sx, sz, t0) in STEPS:
        if np.all(t < t0):
            continue
        r = 64 * (1 - np.exp(-np.maximum(t - t0, 0) / 0.6))
        dead = np.maximum(dead, np.clip((r - np.hypot(x - sx, z - sz)) / 10, 0, 1) * (t >= t0))
    dp = sm(T_DRINK[0], T_DRINK[1], t)
    dead = np.maximum(dead, np.clip((46 * dp - np.hypot(x - PINE[0], z - PINE[2])) / 9, 0, 1))
    return dead


def crack_fn(t):
    op = float(sm(T_CRACK, T_CRACK + 1.4, t) * (1 - sm(T_FORM[1] + 1.0, T_FORM[1] + 4.0, t)))

    def fn(x, z):
        if op <= 0:
            return np.zeros(len(x))
        u = (x - F[0])
        wob = 0.9 * np.sin(u * 0.55) + 0.4 * np.sin(u * 1.7 + 1) + 0.15 * np.sin(u * 4.3)
        half = op * (1.5 * np.clip(1 - (np.abs(u) / (11 * op + 0.5)) ** 2, 0, 1) + 0.1)
        dz = np.abs(z - F[2] - wob)
        return np.clip((half + 0.5 - dz) / 0.5, 0, 1) * (half > 0.12)
    return fn


def look(t, world):
    L = WD.look_night(blood(t))
    L['moon'] = world.moon
    L['key'] = world.key
    L['front'] = 1.0
    L['front_col'] = WD.rgb(150, 240, 200) * (1 - 0.5 * blood(t)) + WD.rgb(240, 120, 100) * 0.5 * blood(t)
    L['crack_glow'] = 0.6
    L['crack_col'] = WD.rgb(120, 16, 10)
    L['mist'] = 0.55 + 0.25 * blood(t)
    return L


# ---------------------------------------------------------------- the film
class Film:
    def __init__(self):
        path = [(F[0] + (P_END[0] - F[0]) * u, F[2] + (P_END[2] - F[2]) * u) for u in np.linspace(0, 1, 9)]
        path.append((PINE[0], PINE[2]))
        r0 = np.random.RandomState(77)
        spots = [(-968 + r0.normal(0, 6), 462 + r0.normal(0, 6)) for _ in range(24)]
        self.v = VL.Valley(F, path, spots)
        self.world = self.v.world
        self.land = self.v.land
        self.col = SW.Colossus()
        J0 = G.pose(lean=0.45, t=0.0)
        P0 = self.col.roaches(J0, 0.0)[0]
        y = (P0[:, 1] - P0[:, 1].min()) / np.ptp(P0[:, 1])
        r = np.random.RandomState(11)
        self.arrive = T_FORM[0] + (T_FORM[1] - T_FORM[0]) * y + r.uniform(-0.35, 0.35, len(y))
        self.tide = SW.Tide(self.col.n, F, 12, (T_POUR, 15.5), 17.2, self.arrive)
        n_x = 4200
        self.extra_arrive = r.uniform(T_FORM[0] - 0.6, T_FORM[1] - 0.5, n_x)
        self.tide_x = SW.Tide(n_x, F, 13, (T_POUR - 0.2, 14.8), 16.8, self.extra_arrive, spread=(10, 245))
        self.feet_target, _ = self._body_world(T_FORM[0])
        ip = self.v.trees.n - 1                                        # the old pine, drunk dry
        self.v.trees.override[ip] = lambda t: float(sm(T_DRINK[0] + 0.4, T_DRINK[1], t))
        self.world.extra.append(self._draw)
        self.dyn = K.ShadowMap((0, 0, 600), self.world.key, 260, 1024)
        self._death_times()
        self._motes()
        self._drips()
        r = np.random.RandomState(41)
        self.mouth = [(r.uniform(T_JAW + 0.4, 61.6), r.normal(0, 3.0, 3), r.uniform(0, 6.3), r.uniform(0.04, 0.06))
                      for _ in range(380)]
        self.lens = [(r.uniform(60.4, 61.9), r.uniform(0, 2 * math.pi), r.uniform(0.3, 1.0), r.uniform(0, 6.3))
                     for _ in range(140)]
        r = np.random.RandomState(51)
        cx = np.r_[r.normal(-930, 70, 300), r.normal(F[0], 40, 200)]
        cz = np.r_[r.normal(520, 60, 300), r.normal(F[2], 40, 200)]
        self.ff = np.stack([cx, self.land.height(cx, cz) + r.uniform(0.4, 3.5, len(cx)), cz], 1)
        self.ff_ph = r.uniform(0, 6.3, len(cx))
        self.fonts = {}

    def _body_world(self, t):
        P, pos, yaw = giant_state(t, self.land)
        J = G.pose(**P)
        Pb = self.col.roaches(J, t)[0]
        return Pb @ (rot((0, 1, 0), yaw) * GS).T + pos, J

    def _death_times(self):
        """When each tree dies (crosses 0.35), for falling leaves and motes."""
        tr = self.v.trees
        td = np.full(tr.n, np.inf)
        for t in np.arange(9.0, 52.0, 0.1):
            d = dead_at(tr.pos[:, 0], tr.pos[:, 2], t - tr.lag)
            for i, fn in tr.override.items():
                d[i] = fn(t)
            hit = (d > 0.35) & ~np.isfinite(td)
            td[hit] = t
        self.tree_death = td

    def _motes(self):
        """Lights of life: lifted off the dying ground, out of dying trees,
        pulled to the crack (before it stands) or into the giant."""
        r = np.random.RandomState(31)
        M = []
        for k in range(1500):
            tb = r.uniform(T_POUR + 1.2, T_BREATH + 4.0)
            R = float(max(tide_front(tb), (228 + 270 * sm(T_BREATH, T_BREATH + 3.4, tb)) if tb > T_BREATH else 0))
            a = r.uniform(0, 2 * math.pi)
            rr = R * r.uniform(0.82, 1.0)
            M.append((tb, F[0] + math.cos(a) * rr, F[2] + math.sin(a) * rr, r.uniform(2.2, 3.8), r.uniform(0, 6.3), 0))
        for (x, z, t0) in STEPS:
            for _ in range(12):
                M.append((t0 + r.uniform(0.2, 1.4), x + r.normal(0, 26), z + r.normal(0, 26), r.uniform(1.4, 2.6),
                          r.uniform(0, 6.3), 0))
        tr = self.v.trees
        for i in np.where(np.isfinite(self.tree_death))[0]:
            if np.hypot(tr.pos[i, 0] - F[0], tr.pos[i, 2] - F[2]) > 700:
                continue
            for _ in range(1):
                M.append((self.tree_death[i] + r.uniform(0, 1.2), tr.pos[i, 0] + r.normal(0, 3), tr.pos[i, 2] +
                          r.normal(0, 3), r.uniform(2.0, 3.2), r.uniform(0, 6.3), 2))
        for k in range(700):                                          # out of the pine, into its hand
            M.append((r.uniform(T_DRINK[0], T_DRINK[1] + 0.5), PINE[0] + r.normal(0, 5), PINE[2] + r.normal(0, 5),
                      r.uniform(0.9, 1.6), r.uniform(0, 6.3), 1))
        M.sort(key=lambda m: m[0])
        self.M = np.array([m[:5] for m in M])
        self.Mk = np.array([m[5] for m in M])
        self.My = np.where(self.Mk == 1, r.uniform(2, 28, len(M)), np.where(self.Mk >= 2, r.uniform(4, 20, len(M)),
                                                                          r.uniform(0.3, 2.5, len(M))))

    def _drips(self):
        """Roaches dropping off it as it walks: when, which, and from where."""
        r = np.random.RandomState(21)
        n = 900
        t0 = np.sort(r.uniform(T_WALK + 0.3, 60.5, n))
        tq = np.round(t0 * 4) / 4
        idx = r.randint(0, self.col.n, n)
        start = np.zeros((n, 3))
        for tt in np.unique(tq):
            Pw, _ = self._body_world(float(tt))
            sel = tq == tt
            start[sel] = Pw[idx[sel]]
        self.drip_t, self.drip_p = t0, start
        self.drip_a = r.uniform(0, 2 * math.pi, n)
        self.drip_v = r.uniform(5, 13, n)
        self.drip_L = r.uniform(0.042, 0.058, n) * GS
        self.drip_ph = r.uniform(0, 6.3, n)

    # -------------------------------------------------------------- cameras
    def camera(self, name, t):
        """(eye, target, fov, focus distance, blur)."""
        if name == 'valley':
            eye = kf(t, [(0, (-966, 7.5, 462)), (7.5, (-936, 14, 494))])
            tgt = kf(t, [(0, (-660, -6, 800)), (7.5, (-600, 30, 900))])
            return eye, tgt, float(kf(t, [(0, 54), (7.5, 50)])), 400, 0.25
        if name == 'crack':
            eye = kf(t, [(7.5, (6.4, 1.05, 590.0)), (13, (5.0, 0.8, 591.6))])
            tgt = kf(t, [(7.5, (0, 0.3, 600.5)), (10, (0, 0.5, 600.2)), (13, (0, 1.2, 600))])
            return eye, tgt, 48, float(np.linalg.norm(eye - tgt)), 1.2
        if name == 'tide':
            eye = kf(t, [(13, (150, 12, 395)), (19, (138, 15, 385))])
            tgt = kf(t, [(13, (0, 4, 600)), (19, (0, 10, 600))])
            return eye, tgt, 50, 130, 0.35
        if name == 'rise':
            eye = kf(t, [(19, (44, 1.8, 520)), (28.5, (40, 2.2, 513))])
            tgt = kf(t, [(19, (0, 6, 600)), (22, (0, 18, 600)), (25.5, (0, 46, 600)), (28.5, (0, 70, 600))])
            return eye, tgt, 74, 95, 0.5
        if name == 'stand':
            eye = kf(t, [(28.5, (-300, 46, 190)), (33.5, (-318, 40, 166))])
            return eye, kf(t, [(28.5, (0, 82, 600)), (33.5, (0, 76, 600))]), 46, 520, 0.4
        if name == 'walk':
            pos, _ = walk_track(t)
            d = (P_END - F) / np.linalg.norm(P_END - F)
            side = np.array([d[2], 0, -d[0]])                         # off to its left
            eye = pos + side * 135 + d * 60
            eye[1] = float(self.land.height(eye[[0]], eye[[2]])[0]) + 6
            tgt = pos + np.array([0, 50.0, 0])
            return eye, tgt, 52, float(np.linalg.norm(tgt - eye)), 1.2
        if name == 'pine':
            eye = kf(t, [(43, (166, 2.6, 196)), (51, (172, 2.4, 202))])
            tgt = kf(t, [(43, (214, 50, 300)), (45.5, (226, 30, 268)), (51, (224, 34, 272))])
            return eye, tgt, 60, float(kf(t, [(43, 110), (45.5, 92), (51, 90)])), 0.8
        if name in ('face', 'reach'):
            push = float(sm(51, 58, t)) * 6
            fwd = (FACE_HEAD - FACE_EYE) / np.linalg.norm(FACE_HEAD - FACE_EYE)
            eye = FACE_EYE + fwd * push
            tgt = FACE_HEAD + np.array([0, -2.0, 0])
            focus = float(np.linalg.norm(tgt - eye))
            if name == 'reach':                                     # pull focus to the hand coming at you
                P, pos, yaw = giant_state(t, self.land)
                J = G.pose(**P)
                hand = G.place(J['wrR'][None], pos, yaw, GS)[0]
                focus = max(2.0, float(np.linalg.norm(hand - eye)) - 3)
            return eye, tgt, 40, focus, 1.6
        return np.array([0, 10, 0.0]), np.array([0, 10, 100.0]), 50, 100, 0.0

    def shake(self, t):
        k = 0.0
        for (x, z, t0) in STEPS:
            if t0 <= t < t0 + 0.6:
                k += 0.45 * (1 - (t - t0) / 0.6) ** 2
        if T_BREATH <= t < T_BREATH + 2.5:
            k += 0.3 * float(sm(T_BREATH, T_BREATH + 0.5, t))
        if T_CRACK <= t < T_CRACK + 1.4:
            k += 0.08
        return np.array([math.sin(t * 61), math.sin(t * 53) * 0.6, math.cos(t * 47)]) * k

    # -------------------------------------------------------------- what moves, drawn into the g-buffer
    def _draw(self, g, cam, t, ctx, mirror):
        if mirror:
            return
        st = self.state
        name = st['name']
        land = self.land
        if T_CRACK <= t < T_FORM[1] + 4:                                  # clods heaved up along the crack
            op = float(sm(T_CRACK, T_CRACK + 1.4, t))
            r = np.random.RandomState(3)
            n = 60
            u = r.uniform(-10, 10, n) * op
            side = np.where(r.rand(n) < 0.5, -1, 1)
            wob = 0.9 * np.sin(u * 0.55) + 0.4 * np.sin(u * 1.7 + 1)
            x = F[0] + u
            z = F[2] + wob + side * (1.5 * op + r.uniform(0.1, 1.2, n))
            y = land.height(x, z) + 0.05
            rr = r.uniform(0.15, 0.6, n) * op
            K.draw_ellipsoids(g, cam, np.stack([x, y, z], 1), np.stack([rr, rr * 0.6, rr * 0.9], 1), WD.ROCK,
                              7900000 + np.arange(n), r.rand(n) * 0.3)
        if T_HERO <= t < 13.5:                                            # the first one, feeling its way out
            a = t - T_HERO
            rise = min(1.0, a * 0.8)
            p = F + np.array([0.8 * math.sin(a * 0.9), 0, -0.4 - 1.1 * max(0, a - 1.0) + 0.3 * math.sin(a * 1.7)])
            p[1] = float(land.height(p[[0]], p[[2]])[0]) - 1.6 * (1 - rise)
            hd = np.array([0.35 * math.cos(a * 0.9), 0.5 * (1 - rise), -1.0])
            nrm = np.array([0, 1.0, 0.3 * (1 - rise)])
            SW.draw_roaches(g, cam, p[None], nrm[None], hd[None], np.array([2.7]),
                            np.array([a * (3 if a < 1.2 else 10)]), 41000000)
        if T_POUR - 0.3 <= t < T_FORM[1] + 0.5:                           # the tide
            self.tide.draw(g, cam, t, land, target=self.feet_target if t > T_FORM[0] - 3 else None)
            self.tide_x.draw(g, cam, t, land, oid0=42000000)
        if t >= T_FORM[0] - 0.8:                                          # the giant
            P, pos, yaw = st['giant']
            J = st['J']
            fill = (t - T_FORM[0] + 0.3) / (T_FORM[1] - T_FORM[0])
            ground = arrive = None
            if t < T_FORM[1] + 0.6:
                ground = self.tide.ground(t, land, self.feet_target)[0]
                arrive = self.arrive
            self.col.draw(g, cam, J, pos, yaw, t, fill=fill if t < T_FORM[1] + 1 else 2.0, arrive=arrive,
                          ground_pts=ground, face=name in ('face', 'reach'), eyes=float(sm(T_EYES, T_EYES + 0.4, t)))
        if t > T_WALK:                                                    # dropping off it
            a = t - self.drip_t
            live = (a >= 0) & (a < 5.0)
            if live.any():
                i = np.where(live)[0]
                aa = a[i]
                p0 = self.drip_p[i]
                gy = land.height(p0[:, 0], p0[:, 2])
                tf = np.sqrt(2 * np.maximum(p0[:, 1] - gy, 0.1) / 22)
                fall = np.minimum(aa, tf)
                dirv = np.stack([np.cos(self.drip_a[i]), np.zeros(len(i)), np.sin(self.drip_a[i])], 1)
                p = p0 + dirv * (5 * fall)[:, None] + np.array([0, 1.0, 0]) * (-0.5 * 22 * fall * fall)[:, None]
                run = np.maximum(aa - tf, 0)
                p = p + dirv * (self.drip_v[i] * run)[:, None]
                p[:, 1] = np.where(run > 0, land.height(p[:, 0], p[:, 2]) + 0.05, np.maximum(p[:, 1], gy))
                tumbling = run <= 0
                hd = np.where(tumbling[:, None], np.stack([np.cos(aa * 9 + self.drip_a[i]), np.sin(aa * 7),
                                                           np.sin(aa * 9 + self.drip_a[i])], 1), dirv)
                nrm = np.where(tumbling[:, None], np.stack([np.sin(aa * 5), np.cos(aa * 5), 0 * aa], 1),
                               np.array([0, 1.0, 0]))
                SW.draw_roaches(g, cam, p, nrm, hd, self.drip_L[i], aa * 11 + self.drip_ph[i], 43000000, ids=i)
        if t >= T_JAW + 0.4 and 'J' in st:                                # pouring out of its mouth
            J = st['J']
            P, pos, yaw = st['giant']
            Rw = rot((0, 1, 0), yaw)
            mloc = J['head'] + J['Rh'] @ np.array([0, -0.07 - 0.02 * J['jaw'], 0.11])
            mouth = mloc @ (Rw * GS).T + pos
            fwd = Rw @ (J['Rh'] @ np.array([0, 0, 1.0]))
            pts, hds, Ls, phs = [], [], [], []
            for (t0, v0, a0, Lr) in self.mouth:
                a = t - t0
                if 0 <= a < 3.2:
                    vel = fwd * 9 + v0 * 1.4
                    p = mouth + vel * a + np.array([0, -0.5 * 22 * a * a, 0])
                    if p[1] > float(land.height(p[[0]], p[[2]])[0]) + 0.3:
                        pts.append(p)
                        hds.append(vel + np.array([0, -22 * a, 0]) + np.array([math.cos(a * 8 + a0), 0, math.sin(a * 8)]))
                        Ls.append(Lr * GS)
                        phs.append(a * 12 + a0)
            if pts:
                hds = np.array(hds)
                SW.draw_roaches(g, cam, np.array(pts), np.cross(hds, np.array([0.3, 0.2, 1.0])), hds, np.array(Ls),
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
                SW.draw_roaches(g, cam, np.array(pts), np.array(nrms), np.array(hds), np.full(len(pts), 0.26),
                                np.array(phs), 45000000)
        tr = self.v.trees                                                 # leaves falling from the dying trees
        a = t - self.tree_death
        dying = np.where((a > 0) & (a < 6))[0]
        if len(dying):
            dying = dying[np.linalg.norm(tr.pos[dying] - cam.eye, axis=1) < 500]
        if len(dying):
            k = 10
            ti = np.repeat(dying, k)
            aa = np.repeat(t - self.tree_death[dying], k) - np.tile(np.linspace(0, 2.0, k), len(dying))
            jj = np.tile(np.arange(k), len(dying))
            ok = aa > 0
            ti, aa, jj = ti[ok], aa[ok], jj[ok]
            if len(ti):
                hsh = (ti * 7919 + jj * 104729) % 1000 / 1000.0
                h0 = tr.H[ti] * (0.4 + 0.5 * hsh)
                ang = hsh * 40
                rad = tr.H[ti] * 0.25 * ((hsh * 13) % 1)
                fall = np.minimum(aa * 2.2, h0)
                p = tr.pos[ti] + np.stack([np.cos(ang) * rad + np.sin(aa * 3 + ang) * 0.8 + aa * 1.5,
                                           h0 - fall, np.sin(ang) * rad + np.cos(aa * 2.6 + ang) * 0.8], 1)
                sz = np.full(len(ti), 0.22)
                K.draw_ellipsoids(g, cam, p, np.stack([sz, sz * 0.25, sz * 0.7], 1), WD.LEAF,
                                  9100000 + np.arange(len(ti)), tr.kind[ti] + hsh * 0.99,
                                  aux=np.full(len(ti), 0.6, np.float32))

    # -------------------------------------------------------------- one frame
    def frame(self, fi):
        t = fi / FPS
        name, t0, t1 = next((s for s in SHOTS if s[1] <= t < s[2]), SHOTS[-1])
        if name == 'title':
            return self.finish(dict(img=np.zeros((AH, AW, 3), np.float32), depth=np.full((AH, AW), 1e9), focus=1,
                                    blur=0, glows=[], name=name), t, fi)
        return self.finish(self.shot(name, t), t, fi)

    def shot(self, name, t):
        eye, tgt, fov, focus, blur = self.camera(name, t)
        eye = eye + self.shake(t)
        cam = Camera(eye, tgt, fov, AW, AH)
        L = look(t, self.world)
        st = dict(name=name)
        if t >= T_FORM[0] - 0.8:
            P, pos, yaw = giant_state(t, self.land)
            st['giant'] = (P, pos, yaw)
            st['J'] = G.pose(**P)
        self.state = st
        ctx = self.v.ctx(dead=lambda x, z: dead_at(x, z, t), dead_t=dead_at)
        ctx['crack'] = crack_fn(t)
        if 'J' in st:                                                   # its shadow
            P, pos, yaw = st['giant']
            self.dyn.recentre(pos + np.array([0, 60.0, 0]), self.world.key, 200)
            fill = (t - T_FORM[0] + 0.3) / (T_FORM[1] - T_FORM[0]) if t < T_FORM[1] + 1 else 2.0
            self.col.draw(self.dyn.g, self.dyn.cam, st['J'], pos, yaw, t, fill=fill, shadow=True)
            ctx['dyn_shadow'] = self.dyn
        img, g, light = self.world.render(cam, t, L, ctx)
        glows = self.glows(cam, g, t, st)
        return dict(img=img, depth=g.depth, focus=focus, blur=blur, glows=glows, name=name, cam=cam, mat=g.mat)

    def glows(self, cam, g, t, st):
        """Points of light: motes of life, fireflies (x, y, intensity, colour, size)."""
        out = []
        a = (t - self.M[:, 0]) / self.M[:, 3]
        live = (a >= 0) & (a <= 1)
        if live.any():
            i = np.where(live)[0]
            e = a[i] * a[i] * (3 - 2 * a[i])
            o = np.stack([self.M[i, 1], self.My[i], self.M[i, 2]], 1)
            o[:, 1] += self.land.height(o[:, 0], o[:, 2])
            if 'J' in st:
                P, pos, yaw = st['giant']
                J = st['J']
                Rw = rot((0, 1, 0), yaw) * GS
                chest = J['chest'] @ Rw.T + pos
                mouth = (J['head'] + J['Rh'] @ np.array([0, -0.06, 0.1])) @ Rw.T + pos
                hand = G.place(J['wrR'][None], pos, yaw, GS)[0]
                tgt = np.where((self.Mk[i] == 1)[:, None], hand, mouth if t > T_BREATH - 0.3 else chest)
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
        if t < 22:                                                      # fireflies, until the drain reaches them
            ff = self.ff + np.stack([np.sin(t * 0.7 + self.ff_ph) * 1.5, np.sin(t * 1.1 + self.ff_ph * 2) * 0.5,
                                     np.cos(t * 0.6 + self.ff_ph) * 1.5], 1)
            dd = dead_at(ff[:, 0], ff[:, 2], t)
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
        img = np.repeat(np.repeat(fr['img'], 2, 0), 2, 1).astype(np.float32) * (1 + 0.22 * blood(t))
        if fr['blur'] > 0:                                              # depth of field
            z = np.repeat(np.repeat(np.minimum(fr['depth'], 1e6), 2, 0), 2, 1)
            coc = np.clip(np.abs(1 / np.maximum(z, 0.3) - 1 / fr['focus']) * fr['focus'] * fr['blur'] * 2.4, 0, 8)
            stops = np.array([0, 1.4, 3.0, 5.2, 8.0])
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
                if ln > 26:                                         # a short tail, not a streak across the sky
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
            em = (fr['mat'] == WD.EYE).astype(np.float32)
            if em.any():
                em = np.repeat(np.repeat(em, 2, 0), 2, 1)
                gl = cv2.GaussianBlur(em, (0, 0), 7) + cv2.GaussianBlur(em, (0, 0), 22) * 0.6
                img += gl[..., None] * np.array([30, 50, 255.0]) * 1.6
        if fr['name'] == 'title':
            img = self.draw_title(img, t)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        img = img * (1 - 0.24 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2))[..., None]
        img = img + np.random.RandomState(fi).normal(0, 0.8, (H, W, 1))
        fade = float(sm(0, 2.2, t) * (1 - sm(END - 1.4, END - 0.1, t)))
        if 61.95 <= t < 62.0:
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


def render(out, workers=4, a=0, b=None, crf=18):
    n = int(END * FPS)
    b = n if b is None else b
    Film()                                                                # builds the caches once
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s',
                           '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf',
                           str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    with Pool(workers, initializer=_init) as pool:
        for k, fr in enumerate(pool.imap(_frame, range(a, b), chunksize=1)):
            ff.stdin.write(fr)
            if k % 48 == 0:
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
