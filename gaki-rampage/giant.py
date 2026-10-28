"""The Gaki in its true shape: a giant in a man's shape, some three hundred
and forty metres tall, starved and wrong. Pale skin over long bones: ribs you
can count, a waist pinched thin, knees and knuckles like knots, arms that hang
past its knees and hands with five long fingers. Down its back a centipede's
plates and spines. A second pair of thin insect arms folded under the ribs,
twitching. A long skull with no nose, deep sockets full of small burning eyes,
antennae from the brow, and a lower jaw split in two that opens sideways like
an insect's mandibles over a wet red mouth.

pose(**params) gives the joints (body units, facing +z, feet on y = 0);
Body().build(J) makes the mesh (material ids in MAT); walk() and jerk() give
the motion."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'teahouse-assets', 'generator'))
from raster3d import Mesh, tube, blob, rot                                       # noqa: E402

SCALE = 150.0                   # body unit -> metres: about 340 m tall standing
MAT = dict(skin=1, bone=2, chitin=3, eye=4, mouth=5, socket=6, claw=7, tendon=8)
LEN = dict(thigh=0.6, shin=0.6, upper=0.66, fore=0.64)


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


def foot_cycle(phase, stride=0.6, lift=0.2):
    """Where an ankle is (z forward, y up) in the body frame at this point of its step."""
    p = phase % (2 * math.pi)
    if p < math.pi:
        return stride / 2 - stride * p / math.pi, 0.0
    s = (p - math.pi) / math.pi
    e = s * s * (3 - 2 * s)
    return -stride / 2 + stride * e, lift * math.sin(math.pi * s) ** 0.8


def jerk(t, seed, every=(0.5, 1.4), snap=0.08, amp=(0.45, 0.25, 0.35)):
    """Wrong attention: the head holds still, then snaps to a new angle."""
    r = np.random.RandomState(seed)
    times = np.cumsum(r.uniform(*every, 200))
    vals = r.uniform(-1, 1, (201, 3)) * np.array(amp)
    i = int(np.searchsorted(times, t))
    if i == 0:
        return tuple(vals[0])
    k = min(1.0, (t - times[i - 1]) / snap)
    k = k * k * (3 - 2 * k)
    return tuple(vals[i] * k + vals[i - 1] * (1 - k))


# ---------------------------------------------------------------- the skeleton
def pose(pelvis=(0, 1.16, 0), lean=0.45, twist=0.0, roll=0.0, head=(0.0, 0.0, 0.0), jaw=0.1, footL=None,
         footR=None, handL=None, handR=None, curlL=0.35, curlR=0.35, small=0.0, t=0.0, **_):
    """Joints for one frame. lean hunches the spine (more toward the top);
    head = (yaw, pitch, roll) on top of it; jaw 0..1 splits the mandibles open;
    foot/hand targets are body-frame points (None: standing / hanging)."""
    J = dict(t=t, jaw=jaw, curlL=curlL, curlR=curlR, small=small)
    P = np.array(pelvis, float)
    R0 = rot((0, 1, 0), twist) @ rot((0, 0, 1), roll)
    R1 = R0 @ rot((1, 0, 0), lean * 0.35)
    R2 = R0 @ rot((1, 0, 0), lean * 0.75)
    R3 = R0 @ rot((1, 0, 0), lean * 1.1)
    J['R'], J['R2'], J['R3'] = R1, R2, R3
    J['pelvis'] = P
    J['waist'] = P + R1 @ np.array([0, 0.2, 0.0])
    J['chest'] = J['waist'] + R2 @ np.array([0, 0.3, 0.02])
    J['shoulders'] = J['chest'] + R3 @ np.array([0, 0.2, -0.01])
    J['neck'] = J['shoulders'] + R3 @ np.array([0, 0.06, 0.02])
    yaw, pitch, hroll = head
    Rh = R3 @ rot((1, 0, 0), -lean * 1.0 + 0.15 + pitch) @ rot((0, 1, 0), yaw) @ rot((0, 0, 1), hroll)
    J['Rh'] = Rh
    J['head'] = J['neck'] + R3 @ np.array([0, 0.14, 0.05]) + Rh @ np.array([0, 0.08, 0.03])
    for s, n in ((-1, 'L'), (1, 'R')):
        hip = P + R0 @ np.array([0.12 * s, -0.03, 0.0])
        ank = np.array([0.15 * s, 0.07, 0.0]) if (footL if s < 0 else footR) is None else \
            np.asarray(footL if s < 0 else footR, float) + np.array([0, 0.07, 0])
        knee, ank = ik2(hip, ank, LEN['thigh'], LEN['shin'], np.array([0.15 * s, 0.0, 1.0]))
        J['hip' + n], J['knee' + n], J['ankle' + n] = hip, knee, ank
        J['toe' + n] = ank + np.array([0.01 * s, -0.06, 0.2])
        sh = J['shoulders'] + R3 @ np.array([0.2 * s, -0.02, -0.02])
        tgt = handL if s < 0 else handR
        tgt = sh + np.array([0.12 * s, -1.0, 0.22]) if tgt is None else np.asarray(tgt, float)
        el, wr = ik2(sh, tgt, LEN['upper'], LEN['fore'], np.array([0.5 * s, 0.1, -1.0]))
        J['sh' + n], J['el' + n], J['wr' + n] = sh, el, wr
        root = J['chest'] + R2 @ np.array([0.13 * s, -0.12, 0.1])            # the insect arms under the ribs
        tw = small * math.sin(t * 19 + s * 2) * 0.3
        e2 = root + R2 @ np.array([0.06 * s, -0.12, 0.12 + 0.06 * tw])
        J['sroot' + n], J['sel' + n] = root, e2
        J['stip' + n] = e2 + R2 @ np.array([-0.02 * s, 0.1 + 0.1 * tw, 0.08])
    return J


# ---------------------------------------------------------------- the mesh
class Body:
    def __init__(self, seed=33):
        self.rng = np.random.RandomState(seed)
        self.jit = {}

    def _j(self, key, n, amt):
        if key not in self.jit or len(self.jit[key]) != n:
            self.jit[key] = self.rng.uniform(-amt, amt, n)
        return self.jit[key]

    def _col(self, key, mat, n):
        r = np.random.RandomState(abs(hash(key)) % (2 ** 31))
        return np.full((n, 3), 200.0, np.float32) * r.uniform(0.82, 1.18, (n, 1))     # shade jitter: the skin's grain

    def limb(self, m, key, pts, radii, mat, sides=10, rough=0.08, n=14):
        pts = np.asarray(pts, float)
        radii = np.asarray(radii, float)
        if len(pts) < n:
            u = np.linspace(0, 1, len(pts))
            uu = np.linspace(0, 1, n)
            pts = np.stack([np.interp(uu, u, pts[:, k]) for k in range(3)], 1)
        if len(radii) != len(pts):
            radii = np.interp(np.linspace(0, 1, len(pts)), np.linspace(0, 1, len(radii)), radii)
        v, f = tube(pts, radii, sides=sides)
        if rough:
            j = self._j(key, len(v), rough)
            ring = np.vstack([np.repeat(pts, sides, 0), pts[[0, -1]]])[:len(v)]
            v = v + (v - ring) * j[:, None]
        m.add(v, f, self._col(key, mat, len(f)), MAT[mat])

    def blob(self, m, key, c, r, mat, R=None, sub=2, rough=0.05):
        v, f = blob((0, 0, 0), r, sub)
        v = v * (1 + self._j(key, len(v), rough)[:, None])
        if R is not None:
            v = v @ np.asarray(R).T
        m.add(v + np.asarray(c), f, self._col(key, mat, len(f)), MAT[mat])

    def spike(self, m, base, tip, r, mat='chitin', sides=5, bend=None):
        base, tip = np.asarray(base, float), np.asarray(tip, float)
        mid = (base + tip) / 2 + (0 if bend is None else np.asarray(bend))
        v, f = tube([base, mid, tip], [r, r * 0.55, 0.002], sides=sides)
        m.add(v, f, self._col('sp', mat, len(f)), MAT[mat])

    @staticmethod
    def arc(a, b, n=8, bend=None):
        a, b = np.asarray(a, float), np.asarray(b, float)
        u = np.linspace(0, 1, n)[:, None]
        p = a + (b - a) * u
        if bend is not None:
            p = p + np.asarray(bend) * np.sin(u * math.pi)
        return p

    def build(self, J):
        m = Mesh()
        R, R2, R3, Rh = J['R'], J['R2'], J['R3'], J['Rh']
        t = J['t']
        # ---------------- torso: pelvis, a starved waist, a ribcage you can count
        self.blob(m, 'pelvis', J['pelvis'] + R @ np.array([0, 0.02, -0.01]), (0.17, 0.12, 0.11), 'skin', R=R)
        self.limb(m, 'waist', [J['pelvis'], J['waist'], J['chest'] - R2 @ np.array([0, 0.12, 0])],
                  [0.13, 0.085, 0.13], 'skin')
        self.blob(m, 'ribcage', J['chest'], (0.19, 0.21, 0.15), 'skin', R=R2)
        for side in (-1, 1):                                            # ribs: arcs round the front
            for k in range(6):
                y = 0.1 - k * 0.045
                w = 0.19 - abs(k - 2) * 0.012
                pts = [J['chest'] + R2 @ np.array([side * w * math.sin(a), y - 0.02 * a, w * 0.8 * math.cos(a) + 0.01])
                       for a in np.linspace(0.25, 1.45, 6)]
                self.limb(m, 'rib%d%d' % (side, k), pts, [0.011, 0.014, 0.01], 'bone', sides=5, rough=0, n=6)
        self.limb(m, 'sternum', [J['chest'] + R2 @ np.array([0, 0.13, 0.15]), J['chest'] + R2 @ np.array([0, -0.08, 0.15])],
                  [0.02, 0.012], 'bone', sides=5, rough=0, n=4)
        for side in (-1, 1):                                            # collarbones and shoulder knobs
            self.limb(m, 'clav%d' % side, [J['shoulders'] + R3 @ np.array([0.02 * side, 0.0, 0.07]), J['sh' + ('L' if side < 0 else 'R')]],
                      [0.025, 0.03], 'bone', sides=6, rough=0, n=5)
            self.blob(m, 'shk%d' % side, J['sh' + ('L' if side < 0 else 'R')], (0.075, 0.07, 0.075), 'skin')
        for k in range(11):                                             # down the back, a centipede's plates
            u = k / 10
            c = J['pelvis'] + (J['neck'] - J['pelvis']) * u
            Rk = R if u < 0.3 else (R2 if u < 0.7 else R3)
            c = c + Rk @ np.array([0, 0, -0.12 - 0.04 * math.sin(u * math.pi)])
            self.blob(m, 'plate%d' % k, c, (0.1 - 0.02 * abs(u - 0.5), 0.035, 0.06), 'chitin', R=Rk @ rot((1, 0, 0), -0.5))
            for side in (-1, 1):
                self.spike(m, c + Rk @ np.array([0.07 * side, 0, -0.01]), c + Rk @ np.array([0.16 * side, 0.03, -0.07]),
                           0.012)
            if k % 2 == 0:
                self.spike(m, c, c + Rk @ np.array([0, 0.05, -0.12]), 0.018)
        # neck: thin, corded
        nb, hb = J['neck'], J['head'] - Rh @ np.array([0, 0.09, 0.02])
        self.limb(m, 'neck', [nb, hb], [0.06, 0.045], 'skin', rough=0.05, n=6)
        for side in (-1, 1):
            self.limb(m, 'cord%d' % side, [nb + R3 @ np.array([0.035 * side, -0.02, 0.03]), hb + Rh @ np.array([0.03 * side, 0, 0.03])],
                      [0.012, 0.01], 'tendon', sides=5, rough=0, n=5)
        # ---------------- the head: a long skull, no nose, deep sockets of small eyes, a split jaw
        H = lambda p: J['head'] + Rh @ np.asarray(p, float)
        hv, hf = tube([H((0, 0.07, -0.15)), H((0, 0.07, -0.06)), H((0, 0.04, 0.02)), H((0, 0.0, 0.07)),
                       H((0, -0.02, 0.095))], [0.06, 0.11, 0.115, 0.105, 0.09], sides=16)
        hv = J['head'] + (hv - J['head']) @ (Rh @ np.diag([0.95, 1.15, 1.0]) @ Rh.T).T
        m.add(hv, hf, self._col('skull', 'skin', len(hf)), MAT['skin'])
        self.blob(m, 'brow', H((0, 0.06, 0.1)), (0.1, 0.022, 0.03), 'bone', R=Rh)
        for s in (-1, 1):
            self.blob(m, 'cheek%d' % s, H((0.072 * s, -0.03, 0.08)), (0.03, 0.025, 0.035), 'bone', R=Rh)
            self.blob(m, 'socket%d' % s, H((0.045 * s, 0.022, 0.105)), (0.042, 0.038, 0.018), 'socket', R=Rh, rough=0.02)
            for k, (dx, dy, r) in enumerate(((0.0, 0.008, 0.016), (-0.017 * s, -0.012, 0.011), (0.016 * s, -0.014, 0.01),
                                             (0.004 * s, -0.024, 0.007))):
                self.blob(m, 'eye%d%d' % (s, k), H((0.045 * s + dx, 0.022 + dy, 0.117)), (r, r, r * 0.8), 'eye', R=Rh,
                          sub=1, rough=0)
            base = H((0.03 * s, 0.075, 0.09))                              # antennae
            d = Rh @ _n(np.array([0.3 * s, 0.9, 0.35]))
            pts = [base]
            for k in range(1, 12):
                w = rot(Rh @ np.array([1.0, 0, 0]), -0.12 + 0.12 * math.sin(t * 3.1 + k * 0.6 + s)) @ \
                    rot(Rh @ np.array([0, 0, 1.0]), 0.07 * s * math.sin(t * 2.3 + k * 0.4))
                d = w @ d
                pts.append(pts[-1] + d * 0.055)
            self.limb(m, 'ant%d' % s, pts, [0.01, 0.003], 'chitin', sides=5, rough=0, n=12)
        jaw = J['jaw']
        for s in (-1, 1):                                               # the jaw, split in two, opening sideways
            ang = s * (0.12 + 0.9 * jaw)
            Rm = Rh @ rot((0, 1, 0), ang) @ rot((1, 0, 0), 0.25 * jaw)
            root = H((0.06 * s, -0.045, 0.07))
            M = lambda p: root + Rm @ np.asarray(p, float)
            pts = [M((0, 0, 0)), M((-0.01 * s, -0.07, 0.06)), M((-0.04 * s, -0.11, 0.13)), M((-0.08 * s, -0.11, 0.19))]
            self.limb(m, 'mand%d' % s, pts, [0.04, 0.034, 0.022, 0.004], 'bone', sides=8, rough=0.03, n=8)
            for k in range(5):                                          # teeth along its inner edge
                b = M((-0.016 * s, -0.05 - 0.013 * k, 0.05 + 0.028 * k))
                self.spike(m, b, b + Rm @ np.array([-0.04 * s, 0.014, 0.004]), 0.008, 'claw', sides=4)
        self.blob(m, 'mouth', H((0, -0.065, 0.095)), (0.045, 0.025 + 0.05 * jaw, 0.03), 'mouth', R=Rh)
        for s in (-1, 1):                                               # palps hanging from the mouth
            pts = [H((0.02 * s, -0.08, 0.11)), H((0.025 * s, -0.13, 0.13 + 0.015 * math.sin(t * 7 + s))),
                   H((0.015 * s, -0.17, 0.11 + 0.02 * math.sin(t * 5 + s)))]
            self.limb(m, 'palp%d' % s, pts, [0.008, 0.006, 0.003], 'chitin', sides=5, rough=0, n=6)
        # ---------------- legs: bony, long feet, long toes
        for s, n in ((-1, 'L'), (1, 'R')):
            hip, knee, ank, toe = J['hip' + n], J['knee' + n], J['ankle' + n], J['toe' + n]
            self.limb(m, 'thigh' + n, self.arc(hip, knee, 8, R @ np.array([0, 0, 0.03])), [0.1, 0.085, 0.06], 'skin')
            self.limb(m, 'shin' + n, self.arc(knee, ank, 8, np.array([0, 0, 0.02])), [0.06, 0.05, 0.035], 'skin')
            self.limb(m, 'shinbone' + n, [knee + np.array([0, -0.03, 0.04]), ank + np.array([0, 0.06, 0.025])],
                      [0.018, 0.012], 'bone', sides=5, rough=0, n=5)
            self.blob(m, 'knee' + n, knee + np.array([0, 0, 0.02]), (0.06, 0.06, 0.055), 'bone')
            self.blob(m, 'heel' + n, ank + np.array([0, -0.03, -0.02]), (0.045, 0.04, 0.05), 'skin')
            self.spike(m, knee, knee + np.array([0.02 * s, 0.05, 0.12]), 0.02)
            for k in range(5):                                          # toes
                spread = (k - 2) * 0.035
                b = ank + np.array([spread * 0.6, -0.05, 0.1])
                e = toe + np.array([spread * 1.6, -0.005, 0.03 - abs(k - 2) * 0.03])
                self.limb(m, 'toe%s%d' % (n, k), [b, (b + e) / 2 + np.array([0, 0.02, 0]), e], [0.02, 0.016, 0.012],
                          'skin', sides=6, rough=0, n=5)
                self.spike(m, e, e + np.array([0, -0.02, 0.035]), 0.009, 'claw', sides=4)
        # ---------------- arms: too long, knuckled, five long fingers
        for s, n in ((-1, 'L'), (1, 'R')):
            sh, el, wr = J['sh' + n], J['el' + n], J['wr' + n]
            self.limb(m, 'upper' + n, self.arc(sh, el, 8, np.array([0, 0, -0.02])), [0.07, 0.06, 0.045], 'skin')
            self.limb(m, 'fore' + n, self.arc(el, wr, 8), [0.05, 0.045, 0.03], 'skin')
            self.blob(m, 'elbow' + n, el, (0.05, 0.05, 0.05), 'bone')
            back = _n(el - (sh + wr) / 2)
            self.spike(m, el, el + back * 0.12, 0.022)
            for k in range(2):                                          # tendons down the forearm
                o = np.cross(_n(wr - el), np.array([0, 1.0, 0])) * 0.022 * (1 if k else -1)
                self.limb(m, 'ften%s%d' % (n, k), [el + o, wr + o * 0.6], [0.01, 0.008], 'tendon', sides=4, rough=0, n=5)
            fd = _n(wr - el)
            side = _n(np.cross(fd, (0, 1, 0)))
            up = _n(np.cross(side, fd))
            palm = wr + fd * 0.06
            self.blob(m, 'palm' + n, palm, (0.05, 0.022, 0.065), 'skin', R=np.stack([side, up, fd], 1))
            curl = J['curl' + n]
            for k in range(5):
                thumb = k == 4
                spread = (k - 1.5) * 0.28 if not thumb else 1.4
                d = rot(up, spread * s * 0.5) @ fd
                base = palm + side * ((k - 1.5) * 0.022 if not thumb else 0.045 * s) + d * 0.05
                p = [base]
                seg = (0.09, 0.075, 0.06) if not thumb else (0.06, 0.05, 0.04)
                for L in seg:
                    d = rot(_n(np.cross(d, up)), -(0.2 + 0.8 * curl) * 0.5) @ d
                    p.append(p[-1] + d * L)
                self.limb(m, 'fing%s%d' % (n, k), p, [0.016, 0.014, 0.011, 0.007], 'skin', sides=6, rough=0, n=7)
                for q in p[1:-1]:
                    self.blob(m, 'kn%s%d%d' % (n, k, len(p)), q, (0.013, 0.013, 0.013), 'bone', sub=1, rough=0)
                self.spike(m, p[-1], p[-1] + d * 0.04, 0.008, 'claw', sides=4)
            # the insect arms
            self.limb(m, 'su' + n, [J['sroot' + n], J['sel' + n]], [0.02, 0.014], 'chitin', sides=6, rough=0, n=5)
            self.limb(m, 'sf' + n, [J['sel' + n], J['stip' + n]], [0.013, 0.003], 'chitin', sides=5, rough=0, n=5)
            self.spike(m, J['stip' + n], J['stip' + n] + R2 @ np.array([0, -0.04, 0.03]), 0.006, 'claw', sides=4)
        return m


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


def walk(t, phase, head=None, jaw=None, lean=0.45, stride=0.6):
    """A long, loping, wrong walk: the arms swinging too far, the head snapping about."""
    zl, yl = foot_cycle(phase, stride)
    zr, yr = foot_cycle(phase + math.pi, stride)
    bob = 0.03 * math.cos(2 * phase)
    return dict(pelvis=(0.03 * math.sin(phase), 1.14 + bob, 0.0), lean=lean + 0.04 * math.cos(2 * phase),
                twist=0.12 * math.sin(phase), roll=0.05 * math.sin(phase), footL=(-0.15, yl, zl), footR=(0.15, yr, zr),
                handL=(-0.36, 0.3 + 0.06 * math.cos(phase), 0.25 + 0.38 * math.sin(phase + math.pi)),
                handR=(0.36, 0.3 + 0.06 * math.cos(phase + math.pi), 0.25 + 0.38 * math.sin(phase)),
                head=head if head is not None else jerk(t, 5),
                jaw=jaw if jaw is not None else 0.08 + 0.25 * max(0, math.sin(t * 1.7)) ** 8,
                small=1.0, t=t, curlL=0.45, curlR=0.45)
