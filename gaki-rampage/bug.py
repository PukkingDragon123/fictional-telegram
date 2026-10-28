"""The Gaki in its true shape: a colossus of chitin, some six hundred metres
tall, hunched like a man and built like an insect. A long hornet's head with
two great compound eyes, three small eyes on the brow, whipping antennae and
two pairs of mandibles over a wet red mouth. A thorax under overlapping
carapace plates with spines down the back, a waist pinched thin, and a fat
segmented wasp's abdomen that breathes. Long arms that reach the ground, with
spiked elbows, a row of mantis serrations and three hooked fingers. A small
second pair of arms folded on the chest, twitching. Backward-kneed legs with
spurs and claws, and torn wings folded down its back.

pose(**params) gives the joints (body units, facing +z, feet on y = 0);
build(J) makes the meshes; motion helpers give the params for a walk, a climb
and so on. Material ids are in MAT."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'teahouse-assets', 'generator'))
from raster3d import Mesh, tube, blob, rot, icosphere, unshare                     # noqa: E402

SCALE = 280.0                   # body unit -> metres: about 600 m tall standing
MAT = dict(chitin=1, plate=2, spike=3, eye=4, mouth=5, wing=6, joint=7, claw=8, ocelli=9, drool=10)
COL = dict(chitin=(22, 25, 24), plate=(26, 34, 40), spike=(38, 50, 62), eye=(20, 40, 210), mouth=(44, 30, 130),
           wing=(120, 110, 100), joint=(42, 26, 46), claw=(12, 12, 14), ocelli=(30, 80, 240), drool=(170, 168, 160))
LEN = dict(thigh=0.56, shin=0.56, meta=0.36, upper=0.64, fore=0.64)


def _n(v):
    return v / (np.linalg.norm(v) + 1e-12)


def ik2(a, t, l1, l2, pole):
    """Two-bone IK: the middle joint and the end, bending toward pole."""
    d = t - a
    L = np.linalg.norm(d)
    u = d / (L + 1e-12)
    L = float(np.clip(L, abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3))
    x = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
    h = math.sqrt(max(l1 * l1 - x * x, 0.0))
    p = _n(pole - u * np.dot(pole, u))
    return a + u * x + p * h, a + u * L


def foot_cycle(phase, stride=0.62, lift=0.22):
    """Where a foot is (z forward, y up) in the body frame at this point of its step."""
    p = phase % (2 * math.pi)
    if p < math.pi:
        return stride / 2 - stride * p / math.pi, 0.0
    s = (p - math.pi) / math.pi
    e = s * s * (3 - 2 * s)
    return -stride / 2 + stride * e, lift * math.sin(math.pi * s) ** 0.8


# ---------------------------------------------------------------- the skeleton
def pose(pelvis=(0, 1.12, 0), lean=0.55, twist=0.0, roll=0.0, head=(0.0, 0.0, 0.0), jaw=0.15, footL=None,
         footR=None, handL=None, handR=None, curlL=0.4, curlR=0.4, wings=0.0, buzz=0.0, breath=0.0, tail=0.0,
         small=0.0, t=0.0):
    """Joints for one frame. head = (yaw, pitch, roll) on top of the lean; jaw
    0..1 opens the mandibles; foot/hand targets are body-frame points (None:
    standing / hanging); wings 0 folded .. 1 spread, buzz their flutter;
    breath pulses the abdomen; small twitches the chest arms."""
    J = dict(t=t, jaw=jaw, curlL=curlL, curlR=curlR, wings=wings, buzz=buzz, breath=breath, small=small)
    P = np.array(pelvis, float)
    R = rot((0, 1, 0), twist) @ rot((0, 0, 1), roll) @ rot((1, 0, 0), lean)
    J['R'] = R
    J['pelvis'] = P
    J['waist'] = P + R @ np.array([0, 0.18, 0.02])
    J['thorax'] = P + R @ np.array([0, 0.42, 0.06])
    J['shoulders'] = P + R @ np.array([0, 0.63, 0.08])
    J['neck'] = P + R @ np.array([0, 0.70, 0.15])
    yaw, pitch, hroll = head
    Rh = R @ rot((1, 0, 0), -lean * 0.85 + pitch) @ rot((0, 1, 0), yaw) @ rot((0, 0, 1), hroll)
    J['Rh'] = Rh
    J['head'] = J['neck'] + R @ np.array([0, 0.06, 0.06]) + Rh @ np.array([0, 0.04, 0.13])
    for s, n in ((-1, 'L'), (1, 'R')):
        # legs: hip -> knee (forward) -> hock (back) -> foot
        hip = P + np.array([0.17 * s, -0.02, 0.0])
        f = np.array([0.2 * s, 0.0, 0.08]) if (footL if s < 0 else footR) is None else \
            np.asarray(footL if s < 0 else footR, float)
        hock = f + np.array([0.01 * s, 0.33, -0.15])
        knee, hock = ik2(hip, hock, LEN['thigh'], LEN['shin'], np.array([0.25 * s, 0.1, 1.0]))
        J['hip' + n], J['knee' + n], J['hock' + n], J['foot' + n] = hip, knee, hock, f
        # arms: shoulder -> elbow (back and out) -> wrist
        sh = J['shoulders'] + R @ np.array([0.30 * s, -0.02, 0.0])
        tgt = (handL if s < 0 else handR)
        tgt = sh + np.array([0.16 * s, -1.05, 0.3]) if tgt is None else np.asarray(tgt, float)
        el, wr = ik2(sh, tgt, LEN['upper'], LEN['fore'], np.array([0.7 * s, 0.25, -1.0]))
        J['sh' + n], J['el' + n], J['wr' + n] = sh, el, wr
        # the small chest arms, folded and twitching
        root = J['thorax'] + R @ np.array([0.1 * s, 0.07, 0.2])
        tw = small * math.sin(t * 23 + s) * 0.25
        e2 = root + R @ np.array([0.05 * s, -0.16, 0.08 + tw * 0.2])
        J['sroot' + n], J['sel' + n] = root, e2
        J['stip' + n] = e2 + R @ np.array([0.0, 0.12 + tw * 0.3, 0.1])
    # the abdomen: a chain of segments curving back and down from the waist
    ab = [P + R @ np.array([0, 0.0, -0.1])]
    d = R @ _n(np.array([0, -0.35, -1.0]))
    for k in range(6):
        sway = rot((0, 1, 0), 0.08 * math.sin(t * 0.9 + k * 0.5) + tail * 0.1) @ rot((1, 0, 0), 0.17 + 0.03 * k)
        d = sway @ d
        ab.append(ab[-1] + d * 0.15)
    J['abdomen'] = np.array(ab)
    return J


# ---------------------------------------------------------------- the meshes
class Body:
    """Builds the meshes for a pose. Fixed roughness per part, so the shapes
    hold from frame to frame."""

    def __init__(self, seed=31):
        self.rng = np.random.RandomState(seed)
        self.jit = {}
        r = np.random.RandomState(seed + 1)
        self.spines = [(r.uniform(0.15, 0.95), r.uniform(-0.6, 0.6), r.uniform(0.08, 0.2)) for _ in range(9)]

    def _j(self, key, n, amt):
        if key not in self.jit or len(self.jit[key]) != n:
            self.jit[key] = self.rng.uniform(-amt, amt, n)
        return self.jit[key]

    def limb(self, m, key, pts, radii, mat, sides=10, rough=0.04, rings=0):
        pts = np.asarray(pts, float)
        radii = np.asarray(radii, float)
        if len(radii) != len(pts):
            radii = np.interp(np.linspace(0, 1, len(pts)), np.linspace(0, 1, len(radii)), radii)
        if rings:                                                   # insect segments: a ridge at each joint
            u = np.linspace(0, 1, len(pts))
            radii = radii * (1 + 0.12 * np.clip(np.cos(u * rings * 2 * math.pi), 0, 1) ** 6)
        v, f = tube(pts, radii, sides=sides)
        j = self._j(key, len(v), rough)
        c = pts.mean(0)
        v = v + (v - c) * j[:, None] * 0.3
        m.add(v, f, COL[mat], MAT[mat])

    def blob(self, m, key, c, r, mat, R=None, sub=2, rough=0.05, flat=False):
        v, f = blob((0, 0, 0), r, sub)
        v = v * (1 + self._j(key, len(v), rough)[:, None])
        if R is not None:
            v = v @ np.asarray(R).T
        v = v + np.asarray(c)
        if flat:
            v, f = unshare(v, f)
        col = COL[mat]
        if mat == 'eye':                                           # every facet glints differently
            col = np.array(COL[mat], np.float32) * np.random.RandomState(len(key)).uniform(0.45, 1.25, (len(f), 1))
        m.add(v, f, col, MAT[mat])

    def spike(self, m, base, tip, r, mat='spike', sides=6, curve=None):
        base, tip = np.asarray(base, float), np.asarray(tip, float)
        mid = (base + tip) / 2 + (0 if curve is None else np.asarray(curve))
        pts = [base, mid, tip]
        v, f = tube(pts, [r, r * 0.55, 0.002], sides=sides)
        m.add(v, f, COL[mat], MAT[mat])

    def curve(self, a, b, n=8, bend=None):
        a, b = np.asarray(a, float), np.asarray(b, float)
        u = np.linspace(0, 1, n)[:, None]
        p = a + (b - a) * u
        if bend is not None:
            p = p + np.asarray(bend) * np.sin(u * math.pi)
        return p

    def build(self, J):
        """(body mesh, wing mesh) for a pose, in body units."""
        m = Mesh()
        R, Rh = J['R'], J['Rh']
        t = J['t']
        # ---------------- torso
        self.limb(m, 'waist', self.curve(J['pelvis'], J['thorax'], 8), [0.15, 0.075, 0.07, 0.14], 'joint', rings=3)
        self.blob(m, 'pelvis', J['pelvis'], (0.2, 0.15, 0.17), 'chitin', R=R)
        self.blob(m, 'thorax', J['thorax'] + R @ np.array([0, 0.06, 0.02]), (0.33, 0.27, 0.26), 'chitin', R=R)
        self.blob(m, 'chest', J['thorax'] + R @ np.array([0, -0.04, 0.16]), (0.22, 0.2, 0.12), 'plate', R=R)
        for k in range(5):                                          # carapace plates down the back
            c = J['waist'] + R @ np.array([0, 0.05 + k * 0.13, -0.16 + 0.015 * k])
            w = 0.34 - 0.035 * abs(k - 2.2)
            self.blob(m, 'plate%d' % k, c, (w, 0.11, 0.2), 'plate', R=R @ rot((1, 0, 0), -0.4), rough=0.05)
            for sx in (-1, 0, 1):                                   # each plate's rear edge is jagged
                b = c + R @ np.array([sx * w * 0.55, -0.06, -0.12])
                self.spike(m, b, b + R @ np.array([sx * 0.05, -0.1, -0.1]), 0.022, sides=4)
        for k, (u, side, ln) in enumerate(self.spines):             # spines down the back
            c = J['waist'] + R @ np.array([side * 0.12, 0.12 + u * 0.5, -0.22 - 0.03 * abs(side)])
            tip = c + R @ np.array([side * 0.12, ln * 0.6, -ln])
            self.spike(m, c, tip, 0.03, curve=R @ np.array([0, 0.04, 0]))
        for s, n in ((-1, 'L'), (1, 'R')):                          # shoulder spikes
            sh = J['sh' + n]
            self.blob(m, 'shp' + n, sh + R @ np.array([0.03 * s, 0.05, -0.02]), (0.19, 0.14, 0.17), 'plate', R=R)
            self.spike(m, sh + R @ np.array([0.04 * s, 0.08, -0.04]), sh + R @ np.array([0.2 * s, 0.32, -0.22]), 0.05,
                       curve=R @ np.array([0.02 * s, 0.05, 0]))
        # neck and head
        self.limb(m, 'neck', self.curve(J['shoulders'] + R @ np.array([0, 0, 0.05]), J['head'] - Rh @ np.array(
            [0, 0.02, 0.1]), 6), [0.1, 0.06, 0.07], 'joint', rings=2)
        H = lambda p: J['head'] + Rh @ (np.asarray(p, float) * 1.35)
        hv, hf = tube([H((0, 0.02, -0.14)), H((0, 0.03, -0.06)), H((0, 0.02, 0.04)), H((0, -0.02, 0.12)),
                       H((0, -0.06, 0.18))], [0.08, 0.13, 0.13, 0.1, 0.06], sides=14)
        hv = J['head'] + (hv - J['head']) @ (Rh @ np.diag([1.35, 1.08, 1.35]) @ Rh.T).T     # flattened, a hornet's
        m.add(hv, hf, COL['chitin'], MAT['chitin'])
        self.blob(m, 'brow', H((0, 0.09, 0.02)), (0.135, 0.05, 0.12), 'plate', R=Rh)
        for s in (-1, 1):                                           # the compound eyes: faceted, glowing
            self.blob(m, 'eye%d' % s, H((0.105 * s, 0.03, 0.04)), (0.095, 0.125, 0.135), 'eye', R=Rh, sub=3,
                      rough=0.0, flat=True)
            self.spike(m, H((0.07 * s, 0.1, -0.06)), H((0.13 * s, 0.2, -0.22)), 0.03)        # horns
        for (x, y) in ((0, 0.13), (-0.03, 0.115), (0.03, 0.115)):   # three small eyes on the brow
            self.blob(m, 'oc%.2f' % x, H((x, y, 0.08)), (0.019, 0.019, 0.019), 'ocelli', R=Rh, sub=1)
        jaw = J['jaw']
        for s in (-1, 1):                                           # mandibles: two pairs, opening sideways
            for pair, (rx, ln, w) in enumerate(((0.06, 0.2, 0.046), (0.035, 0.12, 0.024))):
                ang = s * (0.15 + 0.85 * jaw * (1.0 if pair == 0 else 0.6) + 0.06 * math.sin(t * 9 + pair))
                Rm = Rh @ rot((0, 1, 0), ang)
                root = H((rx * s, -0.07 - pair * 0.02, 0.13))
                M = lambda p: root + Rm @ (np.asarray(p, float) * 1.35)
                pts = [M((0, 0, 0)), M((0.0, -0.02, ln * 0.45)), M((-0.02 * s, -0.04, ln * 0.85)),
                       M((-0.06 * s, -0.045, ln))]
                self.limb(m, 'mand%d%d' % (s, pair), pts, [w, w * 0.8, w * 0.5, 0.003], 'claw', sides=8)
                if pair == 0:
                    for k in range(3):                              # teeth on the inner edge
                        b = M((-0.01 * s, -0.025, ln * (0.35 + k * 0.17)))
                        self.spike(m, b, b + Rm @ np.array([-0.05 * s, -0.01, 0.01]), 0.012, 'claw', sides=4)
        self.blob(m, 'mouth', H((0, -0.075, 0.15)), (0.068, 0.047, 0.054), 'mouth', R=Rh)
        for s in (-1, 1):                                           # palps, hanging and feeling
            pts = [H((0.025 * s, -0.09, 0.15)), H((0.03 * s, -0.16, 0.17 + 0.02 * math.sin(t * 7 + s))),
                   H((0.02 * s, -0.22, 0.14 + 0.03 * math.sin(t * 5 + s)))]
            self.limb(m, 'palp%d' % s, pts, [0.012, 0.009, 0.004], 'joint', sides=6, rings=2)
        if jaw > 0.25:                                              # drool between the open mandibles
            for s in (-1, 1):
                a, b = H((0.05 * s, -0.11, 0.24)), H((0.0, -0.1, 0.17))
                sag = (jaw - 0.25) * 0.25
                pts = self.curve(a, b, 8, (0, -sag, 0)) - np.array([0, 0, 0])
                self.limb(m, 'drool%d' % s, pts, [0.006, 0.003, 0.006], 'drool', sides=5, rough=0)
            d0 = H((0.0, -0.11, 0.2))
            self.limb(m, 'drip', [d0, d0 + np.array([0, -0.12 * jaw, 0]), d0 + np.array([0, -0.22 * jaw, 0.01])],
                      [0.006, 0.004, 0.009], 'drool', sides=5, rough=0)
        for s in (-1, 1):                                           # antennae: long, whipping, segmented
            base = H((0.04 * s, 0.11, 0.12))
            d = Rh @ _n(np.array([0.35 * s, 0.9, 0.5]))
            pts = [base]
            for k in range(1, 13):
                w = rot(Rh @ np.array([1.0, 0, 0]), -0.13 + 0.12 * math.sin(t * 3.1 + k * 0.6 + s)) @ \
                    rot(Rh @ np.array([0, 0, 1.0]), 0.06 * s * math.sin(t * 2.3 + k * 0.4))
                d = w @ d
                pts.append(pts[-1] + d * 0.06)
            self.limb(m, 'ant%d' % s, pts, [0.016, 0.005], 'claw', sides=6, rings=6)
        # ---------------- the abdomen, breathing
        ab = J['abdomen']
        rad = np.array([0.16, 0.24, 0.29, 0.28, 0.23, 0.15, 0.07]) * (1 + 0.05 * J['breath'])
        for k in range(len(ab) - 1):
            c = (ab[k] + ab[k + 1]) / 2
            d = _n(ab[k + 1] - ab[k])
            Rk = np.stack([_n(np.cross((0, 1, 0), d)), _n(np.cross(d, _n(np.cross((0, 1, 0), d)))), d], 1)
            self.blob(m, 'ab%d' % k, c, (rad[k + 1], rad[k + 1] * 0.88, 0.13), 'plate' if k % 2 else 'chitin', R=Rk,
                      rough=0.03)
            if 0 < k < 5:                                           # hooked spines along its top
                b = c + Rk @ np.array([0, rad[k + 1] * 0.85, 0])
                self.spike(m, b, b + Rk @ np.array([0, 0.09, -0.06]), 0.025, sides=5)
        self.spike(m, ab[-1], ab[-1] + _n(ab[-1] - ab[-2]) * 0.18, 0.04, 'claw')                # the sting
        # ---------------- legs
        for s, n in ((-1, 'L'), (1, 'R')):
            hip, knee, hock, foot = J['hip' + n], J['knee' + n], J['hock' + n], J['foot' + n]
            self.limb(m, 'thigh' + n, self.curve(hip, knee, 12, (0, 0, -0.03)), [0.14, 0.125, 0.08], 'chitin', rings=3)
            self.limb(m, 'shin' + n, self.curve(knee, hock, 12, (0, 0, 0.02)), [0.08, 0.065, 0.045], 'chitin', rings=4)
            self.limb(m, 'meta' + n, self.curve(hock, foot + np.array([0, 0.03, 0]), 8), [0.05, 0.04, 0.034],
                      'chitin', rings=3)
            self.blob(m, 'knee' + n, knee, (0.075, 0.075, 0.075), 'plate')
            self.blob(m, 'hockb' + n, hock, (0.045, 0.045, 0.045), 'joint')
            self.spike(m, knee, knee + np.array([0.05 * s, 0.14, 0.12]), 0.035)                  # knee spur
            self.spike(m, hock, hock + np.array([0.02 * s, 0.06, -0.16]), 0.025)                 # heel spur
            for k in range(3):                                      # spines down the shin
                p = knee + (hock - knee) * (0.25 + 0.22 * k)
                self.spike(m, p, p + np.array([0.04 * s, -0.02, -0.07]), 0.012, sides=4)
            for k, a in enumerate((-0.45, 0.0, 0.45)):              # three claws forward, curled down
                d = rot((0, 1, 0), a) @ np.array([0, 0, 0.17])
                self.limb(m, 'toe%s%d' % (n, k), [foot + np.array([0, 0.03, 0]), foot + d * 0.6 + np.array([0, 0.02, 0]),
                                                  foot + d - np.array([0, 0.02, 0])], [0.025, 0.017, 0.002], 'claw',
                          sides=6, rough=0)
        # ---------------- arms
        for s, n in ((-1, 'L'), (1, 'R')):
            sh, el, wr = J['sh' + n], J['el' + n], J['wr' + n]
            self.limb(m, 'upper' + n, self.curve(sh, el, 12, (0, 0.02, 0)), [0.11, 0.095, 0.065], 'chitin', rings=3)
            self.limb(m, 'fore' + n, self.curve(el, wr, 12), [0.075, 0.068, 0.045], 'chitin', rings=4)
            self.blob(m, 'elb' + n, el, (0.075, 0.075, 0.075), 'plate')
            back = _n(el - (sh + wr) / 2)
            self.spike(m, el, el + back * 0.22 + np.array([0, 0.05, 0]), 0.04)                   # elbow spike
            fd = _n(wr - el)
            side = _n(np.cross(fd, (0, 1, 0)))
            for k in range(7):                                      # mantis serrations along the forearm
                p = el + (wr - el) * (0.12 + 0.12 * k)
                self.spike(m, p, p + back * (0.11 - 0.008 * k) + side * 0.02 * s, 0.02, sides=4)
            # the hand: a palm and three long hooked fingers and a thumb
            curl = J['curl' + n]
            palm = wr + fd * 0.07
            self.blob(m, 'palm' + n, palm, (0.075, 0.045, 0.09), 'chitin',
                      R=np.stack([side, _n(np.cross(fd, side)), fd], 1))
            for k, spread in enumerate((-0.4, 0.0, 0.4, 1.2)):
                thumb = k == 3
                d = rot(np.cross(fd, side), spread * (0.8 if thumb else 0.5)) @ fd
                p = [palm + d * 0.04]
                seg = (0.16, 0.14, 0.12) if not thumb else (0.09, 0.08, 0.06)
                ax = _n(np.cross(d, np.cross(fd, side)))           # the axis the finger curls round
                for L in seg:
                    d = rot(ax, -(0.25 + 0.75 * curl) * (1.0 if not thumb else 0.7)) @ d
                    p.append(p[-1] + d * L)
                self.limb(m, 'fing%s%d' % (n, k), p, [0.034, 0.028, 0.02, 0.008], 'chitin', sides=7, rings=3)
                self.spike(m, p[-1], p[-1] + rot(ax, -0.6) @ d * 0.11, 0.016, 'claw', sides=5)
            # the small chest arm
            self.limb(m, 'su' + n, [J['sroot' + n], J['sel' + n]], [0.03, 0.022], 'joint', sides=7, rings=2)
            self.limb(m, 'sf' + n, [J['sel' + n], J['stip' + n]], [0.02, 0.006], 'chitin', sides=6, rings=2)
        # ---------------- wings (drawn see-through, in their own pass)
        wm = Mesh()
        w, bz = J['wings'], J['buzz']
        for s in (-1, 1):
            for k, (ln, wd, off) in enumerate(((0.95, 0.24, 0.0), (0.78, 0.2, 0.08))):
                root = J['thorax'] + R @ np.array([0.07 * s, 0.2 - off, -0.18])
                fl = bz * math.sin(t * 60 + k * 1.3)
                fold = rot((0, 0, 1), -s * (0.15 + w * (1.2 + 0.35 * fl))) @ rot((1, 0, 0), -0.25 - w * 0.5) @ \
                    rot((0, 1, 0), s * (0.12 + k * 0.1 + w * 0.9))
                Rw = R @ fold
                out = Rw @ np.array([0.0, -0.3, -1.0])
                out = _n(out)
                wid = _n(np.cross(out, R @ np.array([0, 1.0, 0])))
                pts = [root]
                n_ = 9
                for i in range(1, n_):
                    u = i / (n_ - 1)
                    pts.append(root + out * ln * u + wid * wd * math.sin(math.pi * u ** 0.8) * s)
                for i in range(n_ - 2, 0, -1):
                    u = i / (n_ - 1)
                    tear = 0.35 if (i in (3, 5) and k == 0) else 0.0     # torn notches
                    pts.append(root + out * ln * u - wid * wd * 0.35 * math.sin(math.pi * u) * (1 - tear) * s)
                pts = np.array(pts)
                tri = [(0, i, i + 1) for i in range(1, len(pts) - 1)]
                wm.add(pts, np.array(tri), COL['wing'], MAT['wing'])
                for i in (3, 5, 7):                                 # veins
                    self.limb(m, 'vein%d%d%d' % (s, k, i), [root, pts[i]], [0.006, 0.002], 'joint', sides=4, rough=0)
        return m, wm


def place(pts, pos, yaw, scale=SCALE):
    R = rot((0, 1, 0), yaw) * scale
    return np.asarray(pts) @ R.T + pos


def place_mesh(mesh, pos, yaw, scale=SCALE):
    R = rot((0, 1, 0), yaw) * scale
    out = Mesh()
    for v, f, c, o in zip(mesh.v, mesh.f, mesh.c, mesh.o):
        out.v.append((v @ R.T + pos).astype(np.float32))
        out.f.append(f)
        out.c.append(c)
        out.o.append(o)
    out.n = mesh.n
    return out


# ---------------------------------------------------------------- how it moves
def jerk(t, seed, every=(0.5, 1.4), snap=0.09, amp=(0.5, 0.35, 0.4)):
    """Insect attention: the head holds still, then snaps to a new angle."""
    r = np.random.RandomState(seed)
    times = np.cumsum(r.uniform(*every, 200))
    vals = r.uniform(-1, 1, (201, 3)) * np.array(amp)
    i = int(np.searchsorted(times, t))
    t0 = times[i - 1] if i > 0 else 0.0
    k = min(1.0, (t - t0) / snap)
    k = k * k * (3 - 2 * k)
    return tuple(vals[i] * k + vals[max(i - 1, 0)] * (1 - k)) if i > 0 else tuple(vals[0])


def walk(t, phase, head=None, jaw=None, wings=0.0, lean=0.55, stride=0.62):
    """A heavy, stalking walk: digitigrade steps, the long arms swinging low,
    the head snapping about."""
    zl, yl = foot_cycle(phase, stride)
    zr, yr = foot_cycle(phase + math.pi, stride)
    bob = 0.035 * math.cos(2 * phase)
    sw = 0.035 * math.sin(phase)
    P = dict(pelvis=(sw, 1.12 + bob, 0.0), lean=lean + 0.03 * math.cos(2 * phase), twist=0.1 * math.sin(phase),
             roll=0.04 * math.sin(phase), footL=(-0.2, yl, zl), footR=(0.2, yr, zr),
             handL=(-0.5, 0.22 + 0.08 * math.cos(phase), 0.42 + 0.32 * math.sin(phase + math.pi)),
             handR=(0.5, 0.22 + 0.08 * math.cos(phase + math.pi), 0.42 + 0.32 * math.sin(phase)),
             head=head if head is not None else jerk(t, 5), jaw=jaw if jaw is not None else 0.12 + 0.1 * max(
                 0, math.sin(t * 1.7)) ** 8, wings=wings, breath=math.sin(t * 1.2), small=1.0, t=t, curlL=0.5,
             curlR=0.5)
    return P
