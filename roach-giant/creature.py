"""The creature: a hundred and twenty metres of something shaped like a man.

Skinny past starving: ribs, collarbones and hip bones under pale skin, a waist
you could close a hand round, legs like stilts, and arms far too long - sixty
metres each, with too many joints - that hang to its shins. Its face is
beautiful: a strong brow, high cheekbones, a straight nose, a sharp jaw, eyes
half-lidded and calm. Then it smiles, and keeps smiling, past the corners of
its mouth and into its cheeks, over too many teeth; and its jaw comes
unhinged.

It is made of roaches. They build it from the feet up, cover every inch, then
crawl away into bands that wind round its limbs and ribs and neck like living
bandages, uncovering the skin - and the face - beneath.

It moves like nothing that has bones. Its spine and its arms are chains
simulated with real inertia and gravity: the spine sways in a slow wave like a
snake standing up, the arms swing and flop and ripple like seaweed, the long
neck wobbles under a head that snaps to new angles and overshoots, tilts too
far, stops dead, snaps again. Its legs lift high and buckle at the knee. The
whole thing is simulated once, from first rise to last reach, at 120 steps a
second, and kept.
"""
import math
import os
import pickle

import numpy as np

import face_sdf as FS
import hd2d as K
import roach2d as R2
import timeline as TL
from timeline import F, PINE, sm, kf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache', 'creature_v3.pkl')
SKIN, TOOTH, LIP, MOUTH, EYE, CORE = 15, 16, 17, 13, 9, 8

THIGH, SHIN, FOOT = 33.0, 33.0, 9.0
HIP_W = 6.0
SPINE_N, SPINE_L = 6, 6.0
NECK_N, NECK_L = 3, 4.6
ARM_N, ARM_L = 9, 7.4                   # nodes from the shoulder (9 nodes, 8 segments: 59 m)
SHOULDER_W = 10.0
HEAD_S = 62.0                           # head units -> metres (the head is about 14 m tall)
G = 9.8
DT = 1.0 / 120


def _n(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def ik2(a, t, l1, l2, pole):
    d = t - a
    L = np.linalg.norm(d)
    u = d / (L + 1e-12)
    L = float(np.clip(L, abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3))
    x = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
    h = math.sqrt(max(l1 * l1 - x * x, 0.0))
    p = pole - u * np.dot(pole, u)
    p = p / (np.linalg.norm(p) + 1e-12)
    return a + u * x + p * h, a + u * L


# ---------------------------------------------------------------- what it is told to do
class Script:
    """The choreography: where its feet go, where it looks, what its hands reach
    for, its face. Everything else the physics does."""

    def __init__(self, land, face_eye, rise_eye):
        self.land = land
        self.face_eye = np.asarray(face_eye, float)
        self.rise_eye = np.asarray(rise_eye, float)
        self.yaw0 = math.pi + 0.35
        r = np.random.RandomState(13)
        self.snaps = np.cumsum(r.uniform(0.55, 1.4, 120)) + TL.T_FORM[1]
        self.snap_v = r.uniform(-1, 1, (121, 3)) * np.array([0.55, 0.3, 0.6])
        self.plants0 = self._stand_plants()

    def ground(self, x, z):
        return float(self.land.height(np.array([x]), np.array([z]))[0])

    def _stand_plants(self):
        right = np.array([math.cos(self.yaw0), 0, -math.sin(self.yaw0)])
        out = {}
        for s, k in ((-1, 'L'), (1, 'R')):
            p = F + right * s * 8.0
            p[1] = self.ground(p[0], p[2])
            out[k] = p
        return out

    def yaw(self, t):
        py = TL.path_yaw()
        pos = self.root_xz(t)
        to_pine = math.atan2(PINE[0] - pos[0], PINE[2] - pos[2])
        to_cam = math.atan2(self.face_eye[0] - pos[0], self.face_eye[2] - pos[2])
        vals = [self.yaw0, py, py, to_pine + 0.35, to_pine + 0.35, to_cam - 0.25]
        for k in range(1, len(vals)):                                  # the short way round each turn
            vals[k] = vals[k - 1] + (vals[k] - vals[k - 1] + math.pi) % (2 * math.pi) - math.pi
        times = [TL.T_WALK, TL.T_WALK + 1.6, TL.T_STOP, 44.6, 51.2, 53.0]
        return float(kf(t, list(zip(times, vals))))

    def feet(self, t):
        """World positions of the two ankles' targets (and a lift amount)."""
        plants = {k: v.copy() for k, v in self.plants0.items()}
        lift = {'L': 0.0, 'R': 0.0}
        swing = 0.78
        for (tl, foot, x, z) in TL.STEPS:
            if t >= tl:
                plants[foot] = np.array([x, self.ground(x, z), z])
            elif t > tl - swing:
                u = (t - (tl - swing)) / swing
                e = u * u * (3 - 2 * u)
                a = plants[foot]
                b = np.array([x, self.ground(x, z), z])
                p = a + (b - a) * e
                p[1] += 15.0 * math.sin(math.pi * u) ** 0.8
                plants[foot] = p
                lift[foot] = math.sin(math.pi * u)
                break
            else:
                break
        return plants, lift

    def root_xz(self, t):
        if t < TL.T_WALK:
            return F.copy()
        plants, _ = self.feet(min(t, TL.T_STOP + 1))
        return (plants['L'] + plants['R']) / 2

    def pelvis(self, t):
        """Pelvis position and the body's forward lean."""
        rise = float(sm(TL.T_FORM[1] + 0.2, TL.T_EYES + 0.6, t))         # it stands up straight as it wakes
        p = self.root_xz(t)
        g = self.ground(p[0], p[2])
        h = 60.0 + 2.0 * rise
        br = float(sm(TL.T_BREATH, TL.T_BREATH + 1.4, t) * (1 - sm(TL.T_BREATH + 2.6, TL.T_BREATH + 3.8, t)))
        h += 1.5 * br
        lean = 0.95 * (1 - rise) + 0.3 * rise - 0.35 * br
        if TL.T_WALK <= t <= TL.T_STOP + 0.8:
            _, lift = self.feet(t)
            h -= 3.0 * (1 - max(lift['L'], lift['R']))           # sinks onto each planted foot
            lean += 0.12
        if t > 44.0:
            lean += 0.25 * float(sm(44.0, 45.6, t) * (1 - sm(49.4, 51.0, t)))
        return np.array([p[0], g + h, p[2]]), lean

    def look(self, t, head_pos):
        """Where the head wants to look (yaw, pitch, roll), absolute."""
        yaw = self.yaw(t)
        if t < TL.T_REVEAL:
            return np.array([yaw, -0.7, 0.15])
        if t < TL.T_BREATH:
            d = self.rise_eye - head_pos
            return np.array([math.atan2(d[0], d[2]), math.atan2(d[1], math.hypot(d[0], d[2])), 0.35 *
                             float(sm(TL.T_EYES, TL.T_EYES + 1.2, t))])
        if t < TL.T_WALK:
            br = float(sm(TL.T_BREATH, TL.T_BREATH + 1.2, t) * (1 - sm(TL.T_BREATH + 2.8, TL.T_BREATH + 3.8, t)))
            return np.array([yaw, 0.75 * br - 0.1, 0.25 + 0.2 * br])
        if t < 43.5:
            i = int(np.searchsorted(self.snaps, t))
            v = self.snap_v[i]
            return np.array([yaw + v[0], -0.15 + v[1], v[2]])
        if t < 51.0:
            d = PINE + np.array([0, 22.0, 0]) - head_pos
            return np.array([math.atan2(d[0], d[2]), math.atan2(d[1], math.hypot(d[0], d[2])),
                             0.45 * float(sm(45, 47, t))])
        d = self.face_eye - head_pos
        tilt = float(kf(t, [(51, 0.1), (53.5, 0.75), (55.5, 0.55), (57, 0.9)]))
        return np.array([math.atan2(d[0], d[2]), math.atan2(d[1], math.hypot(d[0], d[2])), tilt])

    def hands(self, t, pelvis, yaw):
        """(weight, target) for each hand; weight 0 lets it hang and swing."""
        right = np.array([math.cos(yaw), 0, -math.sin(yaw)])
        fwd = np.array([math.sin(yaw), 0, math.cos(yaw)])
        out = {'L': (0.0, None), 'R': (0.0, None)}
        br = float(sm(TL.T_BREATH - 0.2, TL.T_BREATH + 1.3, t) * (1 - sm(TL.T_BREATH + 2.6, TL.T_BREATH + 3.8, t)))
        if br > 0:
            for s, k in ((-1, 'L'), (1, 'R')):
                out[k] = (br, pelvis + np.array([0, 58.0, 0]) + right * s * 52 + fwd * 8)
        w = float(sm(44.0, 45.4, t) * (1 - sm(49.6, 50.6, t)))
        if w > 0:
            out['R'] = (w, PINE + np.array([0, 25.0, 0]))
        w = float(sm(58.2, 60.8, t))
        if w > 0:
            out['R'] = (w, self.face_eye + np.array([0, -2.0, 0]) + fwd * -3)
        return out

    def face(self, t):
        """grin 0..1.3, jaw 0..1, lids 0 (open) .. 1 (shut), eyes 0..1 (burning)."""
        eyes = float(sm(TL.T_EYES, TL.T_EYES + 0.5, t))
        br = float(sm(TL.T_BREATH, TL.T_BREATH + 1.0, t) * (1 - sm(TL.T_BREATH + 2.8, TL.T_BREATH + 3.6, t)))
        lids = float(kf(t, [(TL.T_EYES - 0.5, 1.0), (TL.T_EYES + 0.3, 0.35)])) * (1 - br) + br * 0.9
        grin = float(kf(t, [(TL.T_EYES + 0.5, 0.0), (TL.T_EYES + 2.0, 0.35), (TL.T_BREATH + 3.5, 0.5), (45.0, 0.5),
                            (48.0, 0.85), (51.0, 0.6), (53.6, 1.25)]))
        jaw = float(kf(t, [(TL.T_JAW - 0.1, 0.0), (TL.T_JAW + 0.9, 1.0)]))
        return dict(grin=grin, jaw=jaw, lids=lids, eyes=eyes * (1 - 0.8 * br))


# ---------------------------------------------------------------- the simulation
class Rig:
    """Positions of every joint for every film frame, simulated."""

    def __init__(self, script, t0=TL.T_FORM[0] - 0.6, t1=TL.END - 5.9, fps=TL.FPS):
        self.script = script
        import hashlib
        src = open(__file__).read() + open(os.path.join(HERE, 'timeline.py')).read()
        key = (round(t0, 3), round(t1, 3), fps, hashlib.md5(src.encode()).hexdigest(),
               tuple(np.round(script.face_eye, 2)), tuple(np.round(script.rise_eye, 2)))
        if os.path.exists(CACHE):
            with open(CACHE, 'rb') as fh:
                d = pickle.load(fh)
            if d.get('key') == key:
                self.__dict__.update(d['state'])
                return
        self.t0, self.t1, self.fps = t0, t1, fps
        self.frames = self._simulate()
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, 'wb') as fh:
            pickle.dump(dict(key=key, state=dict(t0=t0, t1=t1, fps=fps, frames=self.frames)), fh, protocol=4)

    def _simulate(self):
        S = self.script
        t = self.t0
        pel, lean = S.pelvis(t)
        yaw = S.yaw(t)
        up = np.array([0, 1.0, 0])
        # spine and neck start curled on the ground; arms in a heap
        spine = np.array([pel + np.array([0, 0.5, 0]) * k * SPINE_L * 0.3 for k in range(SPINE_N + 1)])
        spine_prev = spine.copy()
        neck = np.array([spine[-1] + up * NECK_L * 0.3 * k for k in range(NECK_N + 1)])
        neck_prev = neck.copy()
        arms = {}
        for s, k in ((-1, 'L'), (1, 'R')):
            right = np.array([math.cos(yaw), 0, -math.sin(yaw)])
            sh = spine[-1] + right * s * SHOULDER_W
            pts = np.array([sh + right * s * ARM_L * 0.4 * j + np.array([0, -0.5, 0]) * j for j in range(ARM_N)])
            arms[k] = [pts, pts.copy()]
        head_ang = np.array([yaw, -0.9, 0.0])
        head_vel = np.zeros(3)
        frames = []
        n_steps = int((self.t1 - self.t0) / DT) + 1
        next_frame = self.t0
        r = np.random.RandomState(3)
        for step in range(n_steps):
            t = self.t0 + step * DT
            pel, lean = S.pelvis(t)
            yaw = S.yaw(t)
            fwd = np.array([math.sin(yaw), 0, math.cos(yaw)])
            right = np.array([math.cos(yaw), 0, -math.sin(yaw)])
            rise = float(sm(TL.T_FORM[0], TL.T_FORM[1], t))
            walking = float(sm(TL.T_WALK - 0.5, TL.T_WALK + 0.5, t) * (1 - sm(TL.T_STOP, TL.T_STOP + 1.0, t)))
            # -- spine: springs toward a leaning, swaying column; it lags and whips with inertia
            wave = 0.9 + 0.5 * walking
            tg = [pel]
            for k in range(1, SPINE_N + 1):
                f = k / SPINE_N
                bend = lean * f ** 1.3
                lat = wave * 3.2 * math.sin(t * 1.3 - k * 0.9) * f + 1.2 * math.sin(t * 0.7 + 1) * f
                d = up * math.cos(bend) + fwd * math.sin(bend)
                tg.append(tg[-1] + d * SPINE_L + right * (lat - (0 if k == 1 else 0)) * 0.35)
            tg = np.array(tg)
            spine, spine_prev = self._chain(spine, spine_prev, tg, 55.0, pel, SPINE_L, 0.97, gravity=0.3)
            # -- neck: soft, toward where the head looks
            top = spine[-1]
            look = S.look(t, neck[-1])
            # the head's own angles: springs that overshoot, snapping to each new look
            k_h, c_h = 70.0, 6.0
            dlt = look - head_ang
            dlt[0] = (dlt[0] + math.pi) % (2 * math.pi) - math.pi
            head_vel += (k_h * dlt - c_h * head_vel) * DT
            head_ang += head_vel * DT
            hy, hp = head_ang[0], head_ang[1]
            hd = np.array([math.sin(hy) * math.cos(hp), math.sin(hp), math.cos(hy) * math.cos(hp)])
            tgn = [top]
            for k in range(1, NECK_N + 1):
                f = k / NECK_N
                d = _n(up * (1.4 - f) + hd * (0.4 + f) + right * 0.25 * math.sin(t * 1.1 - k))
                tgn.append(tgn[-1] + d * NECK_L)
            neck[0] = top
            neck, neck_prev = self._chain(neck, neck_prev, np.array(tgn), 40.0, top, NECK_L, 0.96, gravity=0.4)
            # -- arms: hanging chains, swinging, rippling, reaching when told to
            torso_right = _n(np.cross(spine[-1] - spine[-2], fwd))
            if np.dot(torso_right, right) < 0:
                torso_right = -torso_right
            hands = S.hands(t, pel, yaw)
            for s, k in ((-1, 'L'), (1, 'R')):
                pts, prev = arms[k]
                sh = spine[-1] - (spine[-1] - spine[-2]) * 0.25 + torso_right * s * SHOULDER_W
                acc = np.zeros_like(pts)
                acc[:, 1] -= G * (0.35 + 0.65 * rise)
                j = np.arange(ARM_N)[:, None] / (ARM_N - 1)
                ripple = (2.2 + 2.5 * walking) * np.sin(t * 2.1 - np.arange(ARM_N) * 0.75 + (s > 0) * 1.7)[:, None]
                acc += (right * s * 0.6 + fwd * 0.8) * ripple * j
                acc += fwd * (3.0 * math.sin(t * 0.8 + s)) * j
                w, tgt = hands[k]
                if w > 0 and tgt is not None:
                    pull = (tgt - pts[-1])
                    acc[-3:] += pull * (w * 1.6)
                    acc[-3:] -= (pts[-3:] - prev[-3:]) / DT * (w * 1.2)
                pts, prev = self._verlet(pts, prev, acc, sh, ARM_L, 0.992, 7, S)
                arms[k] = [pts, prev]
            if t + 1e-9 >= next_frame:
                frames.append(dict(t=t, pelvis=pel.copy(), yaw=yaw, lean=lean, spine=spine.copy(), neck=neck.copy(),
                                   head_ang=head_ang.copy(), armL=arms['L'][0].copy(), armR=arms['R'][0].copy(),
                                   right=right.copy(), fwd=fwd.copy(), torso_right=torso_right.copy()))
                next_frame += 1.0 / self.fps
        return frames

    @staticmethod
    def _chain(pts, prev, target, k, anchor, seg, damp, gravity=0.0):
        """A chain pulled toward target positions by springs, with inertia."""
        vel = (pts - prev) * damp
        acc = (target - pts) * k
        acc[:, 1] -= G * gravity
        new = pts + vel + acc * DT * DT
        new[0] = anchor
        for _ in range(4):
            for i in range(1, len(new)):
                d = new[i] - new[i - 1]
                L = np.linalg.norm(d) + 1e-9
                new[i] = new[i - 1] + d / L * seg
        return new, pts

    @staticmethod
    def _verlet(pts, prev, acc, anchor, seg, damp, iters, S):
        vel = (pts - prev) * damp
        new = pts + vel + acc * DT * DT
        new[0] = anchor
        for _ in range(iters):
            for i in range(1, len(new)):
                d = new[i] - new[i - 1]
                L = np.linalg.norm(d) + 1e-9
                corr = (L - seg) / L * d
                if i == 1:
                    new[i] -= corr
                else:
                    new[i] -= corr * 0.5
                    new[i - 1] += corr * 0.5
            new[0] = anchor
            for i in range(2, len(new)):                         # a little stiffness: no folding back on itself
                d = new[i] - new[i - 2]
                L = np.linalg.norm(d) + 1e-9
                if L < seg * 1.35:
                    corr = (L - seg * 1.35) / L * d * 0.25
                    new[i] -= corr
                    if i - 2 > 0:
                        new[i - 2] += corr
            new[0] = anchor
        g = np.array([S.ground(p[0], p[2]) for p in new[[-1, -3]]])
        for q, idx in enumerate((-1, -3)):
            if new[idx][1] < g[q] + 1.5:
                new[idx][1] = g[q] + 1.5
        return new, pts

    def frame(self, t):
        i = int(round((t - self.t0) * self.fps))
        return self.frames[int(np.clip(i, 0, len(self.frames) - 1))]


# ---------------------------------------------------------------- the face, in head units (head ~0.23 tall)
def face_prims(expr):
    """Ellipsoids (centre, radii, material, tilt about z) and capsules of the
    face, in the head's own frame: x right, y up, z out of the face."""
    g, j, lids, eyes = expr['grin'], expr['jaw'], expr['lids'], expr['eyes']
    jd = 0.055 * j
    E, C = [], []
    E += [((0, 0.035, -0.012), (0.083, 0.098, 0.096), SKIN, 0),       # cranium
          ((0, -0.005, 0.03), (0.07, 0.096, 0.074), SKIN, 0),         # the face
          ((0, 0.05, 0.05), (0.068, 0.048, 0.05), SKIN, 0),           # forehead
          ((0, 0.031, 0.082), (0.066, 0.013, 0.022), SKIN, 0)]        # brow
    for s in (-1, 1):
        E.append(((0.047 * s, 0.0, 0.066), (0.026, 0.013, 0.028), SKIN, -0.25 * s))   # high cheekbones
        E.append(((0.079 * s, 0.0, 0.0), (0.01, 0.026, 0.018), SKIN, 0))       # ears
        E.append(((0.0085 * s, -0.021, 0.098), (0.0058, 0.0052, 0.006), SKIN, 0))  # nostril wings
        # eyes: an almond hollow tilted up at the outer corner, the eye in it, the lid over it
        E.append(((0.03 * s, 0.016, 0.0885), (0.021, 0.0095, 0.009), MOUTH, 0.18 * s))
        E.append(((0.03 * s, 0.016, 0.092), (0.012, 0.0075, 0.0055), MOUTH, 0.18 * s))
        E.append(((0.03 * s, 0.0155, 0.0965), (0.0048, 0.0048, 0.0022), EYE, 0))
        E.append(((0.03 * s, 0.022 - 0.008 * lids, 0.094), (0.02, 0.0065 + 0.004 * lids, 0.0075), SKIN, 0.18 * s))
        C.append(((0.064 * s, -0.022, -0.002), (0.022 * s, -0.083 - jd, 0.068 - jd * 0.3), 0.013, SKIN))  # jawline
    C.append(((0, 0.024, 0.097), (0, -0.014, 0.107), 0.0062, SKIN))   # bridge of the nose
    E.append(((0, -0.017, 0.104), (0.0095, 0.0085, 0.0095), SKIN, 0))  # tip of the nose
    E.append(((0, -0.062 - jd, 0.036 - jd * 0.3), (0.06, 0.034, 0.064), SKIN, 0))   # the jaw
    E.append(((0, -0.088 - jd, 0.072 - jd * 0.3), (0.022, 0.016, 0.018), SKIN, 0))  # chin
    # the mouth: lips, and the grin cut across the face past where a mouth should end
    E.append(((0, -0.042, 0.093), (0.022 + 0.006 * g, 0.0052, 0.01), LIP, 0))
    E.append(((0, -0.0535 - jd, 0.091 - jd * 0.2), (0.019 + 0.005 * g, 0.006, 0.01), LIP, 0))
    wg = 0.024 + 0.05 * g
    n = 27
    for i in range(n):
        u = (i / (n - 1)) * 2 - 1
        x = u * wg
        y = -0.048 + 6.5 * g * x * x - 0.5 * jd * (1 - u * u)
        z = 0.0985 - 5.0 * x * x
        h = 0.0018 + 0.0035 * g * (1 - abs(u)) + 0.5 * jd * (1 - u * u) ** 0.5
        E.append(((x, y, z), (wg / n * 2.4, h, 0.006), MOUTH, 0))
        if g > 0.15 and abs(u) < 0.95 and i % 2 == 0:              # too many teeth
            E.append(((x, y + h * 0.7, z + 0.002), (wg / n * 0.85, 0.0028 + 0.001 * g, 0.003), TOOTH, 0))
            if j > 0.15:
                E.append(((x, y - h * 0.7, z + 0.001), (wg / n * 0.85, 0.0026, 0.003), TOOTH, 0))
    return E, C


# ---------------------------------------------------------------- where the roaches go
class Swarm:
    """The roaches that make it: each on a track (a leg, the torso, an arm, a
    finger, the head), at a place along it and an angle round it. While it forms
    they cover it evenly; then each crawls to its place in one of the bands
    that wind round the tracks."""

    def __init__(self, n=5600, n_head=1100, seed=5):
        r = np.random.RandomState(seed)
        self.tracks = ['legL', 'legR', 'torso', 'armL', 'armR']
        share = np.array([0.17, 0.17, 0.26, 0.2, 0.2])
        self.track = r.choice(len(self.tracks), n, p=share / share.sum())
        self.s_u = r.rand(n)                                   # even cover
        self.th_u = r.uniform(0, 2 * math.pi, n)
        nb = 2
        self.band = r.randint(0, nb, n)
        self.turns = np.where(self.band == 0, 2.6, -1.8) + r.normal(0, 0.05, n)
        self.th0 = self.band * math.pi + r.uniform(-0.55, 0.55, n)
        self.speed = r.uniform(0.006, 0.02, n) * np.where(r.rand(n) < 0.5, -1, 1)
        self.size = r.uniform(1.6, 2.6, n)
        self.gait = r.uniform(7, 12, n)
        self.ph0 = r.uniform(0, 6.3, n)
        self.delay = r.uniform(0, 1.4, n)
        self.n = n
        # the head: a cap of them like hair, and one band across the face
        m = n_head
        self.h_phi_u = np.arccos(r.uniform(-1, 1, m))
        self.h_th_u = r.uniform(0, 2 * math.pi, m)
        k = r.rand(m) < 0.78
        self.h_phi_b = np.where(k, r.uniform(0, 1.25, m), r.uniform(0.9, 2.3, m))
        self.h_th_b = np.where(k, r.uniform(0, 2 * math.pi, m), r.uniform(-0.25, 0.25, m))
        self.h_band = ~k
        self.h_size = r.uniform(0.9, 1.5, m)
        self.h_dth = r.normal(0, 0.05, m)
        self.h_gait = r.uniform(8, 13, m)
        self.m = m


def track_polylines(fr, legs):
    """The tracks as polylines with a radius at each point."""
    sp, nk = fr['spine'], fr['neck']
    rad_sp = np.array([5.6, 3.6, 3.3, 4.9, 5.4, 5.0, 4.4])
    torso = np.vstack([sp, nk[1:]])
    rad_t = np.r_[rad_sp, [2.3, 2.1, 2.0]]
    out = {'torso': (torso, rad_t)}
    for k in 'LR':
        hip, knee, ank, toe = legs[k]
        out['leg' + k] = (np.array([hip, knee, ank, toe]), np.array([2.6, 1.8, 1.25, 0.9]))
        arm = fr['arm' + k]
        out['arm' + k] = (arm, np.linspace(2.1, 1.25, len(arm)))
    return out


def on_track(poly, rad, s, th, ref):
    """Points at fraction s along a polyline, angle th round it: position,
    outward normal, and the direction along the track."""
    seg = np.diff(poly, axis=0)
    L = np.linalg.norm(seg, axis=1)
    cum = np.r_[0, np.cumsum(L)]
    d = s * cum[-1]
    i = np.clip(np.searchsorted(cum, d) - 1, 0, len(seg) - 1)
    u = (d - cum[i]) / np.maximum(L[i], 1e-9)
    T = seg[i] / np.maximum(L[i], 1e-9)[:, None]
    e1 = np.cross(T, ref)
    bad = np.linalg.norm(e1, axis=1) < 1e-3
    e1[bad] = np.cross(T[bad], np.array([1.0, 0, 0]))
    e1 = _n(e1)
    e2 = np.cross(T, e1)
    nr = np.cos(th)[:, None] * e1 + np.sin(th)[:, None] * e2
    r = rad[i] + (rad[i + 1] - rad[i]) * u
    P = poly[i] + seg[i] * u[:, None] + nr * (r + 0.4)[:, None]
    return P, nr, T


class Creature:
    def __init__(self, land, face_eye, rise_eye):
        self.script = Script(land, face_eye, rise_eye)
        self.rig = Rig(self.script)
        self.swarm = Swarm()
        self.land = land

    # -------------------------------------------------------------- the skeleton at a moment
    def pose(self, t):
        fr = self.rig.frame(t)
        S = self.script
        plants, lift = S.feet(t)
        legs = {}
        fwd, right = fr['fwd'], fr['right']
        for s, k in ((-1, 'L'), (1, 'R')):
            hip = fr['pelvis'] + right * s * HIP_W + np.array([0, -1.5, 0])
            ank = plants[k] + np.array([0, 3.0, 0])
            wob = 0.35 * math.sin(t * 2.3 + s) + 0.6 * lift[k]
            pole = fwd * (1.0 + wob) + right * s * (0.25 + 0.3 * math.sin(t * 1.7 + 2 * s)) + np.array([0, 0.3, 0])
            knee, ank = ik2(hip, ank, THIGH, SHIN, pole)
            toe = ank + _n(fwd + right * s * 0.25) * FOOT + np.array([0, -2.5, 0])
            legs[k] = (hip, knee, ank, toe)
        ha = fr['head_ang']
        Rh = rot_y(ha[0]) @ rot_x(-ha[1]) @ rot_z(-ha[2])
        head = fr['neck'][-1] + Rh @ np.array([0, 0.11, 0.01]) * HEAD_S
        return dict(fr=fr, legs=legs, Rh=Rh, head=head, expr=S.face(t), t=t)

    # -------------------------------------------------------------- drawing it
    def draw(self, g, cam, t, P, fill=2.0, reveal=1.0, ground_pts=None, arrive=None, shadow=False):
        fr = P['fr']
        cut = self.script.ground(F[0], F[2]) + 130 * (fill - 0.06) if fill < 1.5 else 1e9
        caps_A, caps_B, caps_r, caps_m = [], [], [], []
        ells = []

        def cap(a, b, r, m=SKIN):
            caps_A.append(a)
            caps_B.append(b)
            caps_r.append(r)
            caps_m.append(m)
        for k in 'LR':                                         # stilts of legs, knobbed knees
            hip, knee, ank, toe = P['legs'][k]
            cap(hip, knee, 2.2)
            cap(knee, ank, 1.5)
            cap(ank, toe, 1.0)
            ells.append((knee + _n(knee - (hip + ank) / 2) * 0.8, (2.1, 2.1, 2.1), np.eye(3), SKIN))
        sp, nk = fr['spine'], fr['neck']
        rad_sp = [5.0, 3.2, 2.9, 4.0, 4.6, 4.2]
        for i in range(SPINE_N):
            cap(sp[i], sp[i + 1], rad_sp[i])
        for i in range(NECK_N):
            cap(nk[i], nk[i + 1], 1.9)
        fwd, tr = fr['fwd'], fr['torso_right']
        upv = _n(sp[-1] - sp[0])
        fwd_t = _n(np.cross(tr, upv))
        Rb = np.stack([tr, upv, fwd_t], 1)
        ells.append((sp[0] + upv * 1.0, (6.6, 4.0, 3.6), Rb, SKIN))          # pelvis
        for s in (-1, 1):
            ells.append((sp[0] + tr * s * 5.2 + upv * 2.2 + fwd_t * 1.2, (1.8, 2.4, 1.5), Rb, SKIN))   # hip bones
        for lvl, (i, w, d) in enumerate(((3, 5.2, 3.6), (4, 6.0, 4.0), (5, 5.6, 3.6), (4.5, 6.2, 4.1), (3.5, 5.6, 3.8))):
            i0 = int(i)
            c = sp[i0] + (sp[min(i0 + 1, SPINE_N)] - sp[i0]) * (i - i0)
            for s in (-1, 1):                                  # ribs: arcs from the spine round to the breastbone
                pts = [c - fwd_t * d * 0.8 + tr * s * 1.0, c - fwd_t * d * 0.2 + tr * s * w,
                       c + fwd_t * d * 0.65 + tr * s * w * 0.75 - upv * 1.2, c + fwd_t * d * 1.0 + tr * s * 0.9 - upv * 2.2]
                for a, b in zip(pts, pts[1:]):
                    cap(a, b, 0.75)
        shL = fr['armL'][0]
        shR = fr['armR'][0]
        stern = sp[-1] + fwd_t * 3.4 - upv * 1.0
        cap(stern, shL, 0.9)                                  # collarbones
        cap(stern, shR, 0.9)
        for k in 'LR':                                         # arms: too long, too many knuckles
            arm = fr['arm' + k]
            rr = np.linspace(1.9, 1.15, len(arm))
            for i in range(len(arm) - 1):
                cap(arm[i], arm[i + 1], rr[i])
            for i in (2, 5):
                ells.append((arm[i], (rr[i] * 1.35,) * 3, np.eye(3), SKIN))
            ells.append((arm[0], (2.6, 2.6, 2.6), np.eye(3), SKIN))
            # the hand: a narrow palm and five long fingers
            d = _n(arm[-1] - arm[-2])
            side = _n(np.cross(d, fwd)) if abs(np.dot(d, fwd)) < 0.95 else tr
            upn = np.cross(side, d)
            palm = arm[-1] + d * 2.4
            ells.append((palm, (1.7, 0.7, 2.6), np.stack([side, upn, d], 1), SKIN))
            w_, tgt = self.script.hands(t, fr['pelvis'], fr['yaw'])[k]
            curl = 0.35 + 0.5 * math.sin(t * 0.9 + (k == 'R')) ** 2 * 0.5
            if w_ > 0.5:
                curl = 0.2 + 0.6 * float(sm(TL.T_DRINK[0], TL.T_DRINK[0] + 0.5, t)) if k == 'R' and t < 52 else 0.15
            for f in range(5):
                thumb = f == 4
                spread = ((f - 1.5) * 0.24) if not thumb else 1.2
                dd = _n(d * math.cos(spread) + side * math.sin(spread) * (1 if k == 'R' else -1))
                p = palm + d * 1.8 + side * ((f - 1.5) * 0.75 if not thumb else 1.4)
                tw = 0.25 * math.sin(t * 5.3 + f * 1.7 + (k == 'R') * 2)          # each finger twitching on its own
                for L_ in ((4.4, 3.6, 2.9) if not thumb else (3.0, 2.4, 1.9)):
                    a = (curl + tw) * 0.55
                    dd = _n(dd * math.cos(a) - upn * math.sin(a))
                    q = p + dd * L_
                    cap(p, q, 0.5)
                    p = q
        # the head: sculpted and ray-marched when it is big on screen, a few shapes when it is not
        Rh, head, ex = P['Rh'], P['head'], P['expr']
        hc = cam.to_cam(head[None])[0]
        sculpt = (not shadow) and hc[2] > 1 and 0.12 * HEAD_S * cam.focal / hc[2] > 22 and t > TL.T_REVEAL + 0.5
        E, Cf = ([], []) if sculpt else face_prims(ex)
        for (c, r, m, tilt) in E:
            Rm = Rh @ rot_z(tilt) if tilt else Rh
            ells.append((head + Rh @ np.array(c) * HEAD_S, tuple(np.array(r) * HEAD_S), Rm, m))
        for (a, b, r, m) in Cf:
            cap(head + Rh @ np.array(a) * HEAD_S, head + Rh @ np.array(b) * HEAD_S, r * HEAD_S, m)
        # until the roaches crawl off it, what shows between them is the dark of more roaches
        body_bare = t > TL.T_FORM[1] + 0.8
        face_bare = t > TL.T_REVEAL + 0.5
        n_face = len(E) + len(Cf)
        mm_ = np.array(caps_m)
        if not body_bare:
            mm_[:len(caps_m) - len(Cf)][mm_[:len(caps_m) - len(Cf)] == SKIN] = CORE
        if not face_bare:
            mm_[len(caps_m) - len(Cf):][np.isin(mm_[len(caps_m) - len(Cf):], (SKIN, LIP, TOOTH))] = CORE
        caps_m = list(mm_)
        for q in range(len(ells)):
            c_, r_, R_, m_ = ells[q]
            in_face = q >= len(ells) - len(E)
            if m_ in (SKIN, LIP, TOOTH) and ((in_face and not face_bare) or (not in_face and not body_bare)):
                ells[q] = (c_, r_, R_, CORE)
        # forming: only what the roaches have reached yet
        A = np.array(caps_A)
        B = np.array(caps_B)
        rr = np.array(caps_r)
        mm = np.array(caps_m, np.int16)
        lo = np.where((A[:, 1] <= B[:, 1])[:, None], A, B)
        hi = np.where((A[:, 1] <= B[:, 1])[:, None], B, A)
        keep = lo[:, 1] < cut
        if keep.any():
            k_ = np.clip((cut - lo[keep, 1]) / np.maximum(hi[keep, 1] - lo[keep, 1], 1e-6), 0, 1)[:, None]
            K.draw_capsules(g, cam, lo[keep], lo[keep] + (hi[keep] - lo[keep]) * k_, rr[keep], mm[keep],
                            (8100000 + np.where(keep)[0]).astype(np.int32), 0.3, widen=not shadow, ao=0.9)
        C = np.array([e[0] for e in ells])
        Rd = np.array([e[1] for e in ells], float)
        Rm = np.array([e[2] for e in ells])
        Mt = np.array([e[3] for e in ells], np.int16)
        keep = C[:, 1] - Rd.max(1) < cut
        if shadow:
            keep &= (Mt == SKIN)
        if keep.any():
            eyes = ex['eyes']
            var = np.where(Mt == EYE, eyes, 0.3).astype(np.float32)
            K.draw_ellipsoids(g, cam, C[keep], Rd[keep], Mt[keep], (8200000 + np.where(keep)[0]).astype(np.int32),
                              var[keep], Rm=Rm[keep], widen=not shadow, ao=0.9)
        if shadow:
            return
        if sculpt:
            FS.draw(g, cam, head, Rh, HEAD_S, ex)
        self.draw_roaches(g, cam, t, P, fill, reveal, ground_pts, arrive)

    def roach_points(self, t, P, reveal=1.0):
        """Every body roach's place, normal, heading and size right now."""
        sw = self.swarm
        fr = P['fr']
        polys = track_polylines(fr, P['legs'])
        Pw = np.zeros((sw.n, 3))
        Nw = np.zeros((sw.n, 3))
        Hw = np.zeros((sw.n, 3))
        # how far each has crawled from even cover into its band: bottom first, the face last
        for k, name in enumerate(sw.tracks):
            sel = sw.track == k
            if not sel.any():
                continue
            poly, rad = polys[name]
            ref = fr['fwd'] if name.startswith('leg') or name == 'torso' else np.array([0, 1.0, 0])
            s_band = (sw.s_u[sel] + sw.speed[sel] * (t - TL.T_FORM[1])) % 2
            s_band = np.where(s_band > 1, 2 - s_band, s_band)
            th_band = sw.th0[sel] + 2 * math.pi * sw.turns[sel] * s_band + 0.25 * t
            st = np.clip((t - TL.T_FORM[1] - 0.3 - sw.delay[sel]) / 1.6, 0, 1) * reveal
            st = st * st * (3 - 2 * st)
            s_ = sw.s_u[sel] * (1 - st) + s_band * st
            dth = (th_band - sw.th_u[sel] + math.pi) % (2 * math.pi) - math.pi
            th = sw.th_u[sel] + dth * st
            p, nr, T = on_track(poly, rad, np.clip(s_, 0, 0.999), th, ref)
            Pw[sel], Nw[sel] = p, nr
            Hw[sel] = T * np.sign(sw.speed[sel])[:, None] + np.cross(T, nr) * 0.3
        return Pw, Nw, Hw

    def head_points(self, t, P, reveal):
        sw = self.swarm
        Rh, head = P['Rh'], P['head']
        st = np.clip((t - TL.T_REVEAL) / 1.4, 0, 1) * reveal
        st = st * st * (3 - 2 * st)
        phi = sw.h_phi_u * (1 - st) + sw.h_phi_b * st
        th = sw.h_th_u * (1 - st) + (sw.h_th_b + sw.h_dth * t) * st
        # the band across the face runs diagonally, from the left temple to the right jaw
        band = sw.h_band & (st > 0)
        rad = np.array([0.088, 0.103, 0.1]) * HEAD_S * 1.04
        loc = np.stack([np.sin(phi) * np.sin(th), np.cos(phi), np.sin(phi) * np.cos(th)], 1)
        if band.any():
            u = (phi[band] - 0.9) / 1.4
            loc_b = np.stack([0.95 - 1.1 * u + 0.12 * np.sin(th[band] * 9), -0.05 - 0.75 * u, 0.0 * u], 1)
            loc_b[:, 2] = np.sqrt(np.clip(1 - loc_b[:, 0] ** 2 - loc_b[:, 1] ** 2, 0.05, 1))
            loc_b = loc_b / np.linalg.norm(loc_b, axis=1, keepdims=True)
            loc[band] = loc[band] * (1 - st) + loc_b * st
        loc = loc / np.linalg.norm(loc, axis=1, keepdims=True)
        p = head + (loc * rad + np.array([0, 0.035, -0.01]) * HEAD_S) @ Rh.T
        n = _n((loc / rad) @ Rh.T)
        h = np.cross(n, Rh[:, 1]) + 0.3 * np.cross(n, Rh[:, 0])
        return p, n, h

    def draw_roaches(self, g, cam, t, P, fill, reveal, ground_pts, arrive):
        sw = self.swarm
        Pw, Nw, Hw = self.roach_points(t, P, reveal)
        L = sw.size.copy()
        ph = t * sw.gait + sw.ph0
        ids = np.arange(sw.n)
        if arrive is not None and ground_pts is not None:
            on = t >= arrive
            climb = ~on & (t >= arrive - 1.3)
            if climb.any():
                e = np.clip((t - (arrive[climb] - 1.3)) / 1.3, 0, 1)
                e = e * e * (3 - 2 * e)
                g0 = ground_pts[climb]
                Pw[climb] = g0 * (1 - e[:, None]) + Pw[climb] * e[:, None] + np.array([0, 1.0, 0]) * \
                    (np.sin(math.pi * e) * 5)[:, None]
                Hw[climb] = Pw[climb] - g0 + 1e-3
                Nw[climb] = _n(np.cross(np.cross(Hw[climb], [0, 1.0, 0]) + [1e-3, 0, 0], Hw[climb]))
            sel = on | climb
            Pw, Nw, Hw, L, ph, ids = Pw[sel], Nw[sel], Hw[sel], L[sel], ph[sel], ids[sel]
        R2.draw(g, cam, Pw, Nw, Hw, L, ph, 20000000, ids=ids, tol=0.6, dim=0.42)
        if fill >= 0.85:
            hp, hn, hh = self.head_points(t, P, reveal)
            R2.draw(g, cam, hp, hn, hh, sw.h_size * (1.0 + 0.6 * float(t < TL.T_REVEAL)),
                    t * sw.h_gait, 30000000, tol=0.4, dim=0.42)
