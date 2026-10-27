"""The Gaki: a giant in human shape, made of what was left of the people who
lived here - their greed, which outlived them. A low-poly body built on a
skeleton, long-armed and hollow-eyed, wrapped in tendrils that writhe and drag
behind it, swarming with the black insects it is made of.

pose(t, phase, ...) gives the joints for a frame; mesh(joints, ...) builds the
body around them; tendrils(...) and the eyes and mouth come with it."""
import math
import numpy as np
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'teahouse-assets', 'generator'))
from raster3d import Mesh, tube, blob, rot                          # noqa: E402

# the rest pose, facing +z, in body units (about 2.15 tall); the scene scales it up
REST = dict(pelvis=(0, 1.0, 0), spine=(0, 1.24, 0.01), chest=(0, 1.5, 0.02), neck=(0, 1.72, 0.0),
            head=(0, 1.95, 0.02))
SCALE = 30.0                     # body unit -> metres: some 65 m tall
BODY = (24, 22, 26)             # the colour the renderer shades (it is restyled black afterwards)


def _leg(hip, side, flex, knee, ankle, lean):
    """Hip -> knee -> ankle -> toe in the body frame, from joint angles (radians)."""
    thigh, shin, foot = 0.47, 0.46, 0.17
    d1 = np.array([0, -math.cos(flex), math.sin(flex)])
    d2 = np.array([0, -math.cos(flex - knee), math.sin(flex - knee)])
    k = hip + d1 * thigh
    a = k + d2 * shin
    fa = flex - knee + math.pi / 2 - ankle
    toe = a + np.array([0, -math.cos(fa) * foot * 0.2, math.sin(fa) * foot])
    return k, a, toe


def pose(phase, run=1.0, lean=0.32, crouch=0.0, look=0.0, sway=0.0):
    """Joint positions (body frame) for a running stride at `phase` (radians).
    run=0 stands still (crouch bends it low, as it rises out of the ground)."""
    s, c = math.sin(phase), math.cos(phase)
    bob = run * 0.06 * abs(math.cos(phase)) - crouch * 0.45
    J = {}
    pel = np.array([0.0, 1.0 + bob, 0.0])
    J['pelvis'] = pel
    tw = run * 0.18 * s                                             # the shoulders turn against the hips
    lean_ = lean * run + crouch * 0.5
    R = rot((1, 0, 0), lean_) @ rot((0, 1, 0), tw)
    J['spine'] = pel + R @ np.array([0, 0.24, 0.01])
    J['chest'] = pel + R @ np.array([0, 0.5, 0.02])
    J['neck'] = pel + R @ np.array([0, 0.72, 0.0])
    Rh = R @ rot((1, 0, 0), -lean_ * 0.7 + 0.08 * run * math.sin(2 * phase)) @ rot((0, 1, 0), look) @ rot((0, 0, 1), sway)
    J['head'] = J['neck'] + Rh @ np.array([0, 0.23, 0.02])
    J['Rh'] = Rh
    for side, ph in ((-1, 0.0), (1, math.pi)):
        p = phase + ph
        hip = pel + np.array([0.12 * side, -0.02, 0])
        flex = run * (0.62 * math.sin(p) + 0.12) + crouch * 1.1
        knee = run * (0.25 + 1.15 * max(0.0, math.sin(p + 1.2)) ** 1.5) + crouch * 2.0
        ankle = run * (0.2 * math.sin(p - 0.6)) + crouch * 0.7
        k, a, toe = _leg(hip, side, flex, knee, ankle, lean_)
        n = 'L' if side < 0 else 'R'
        J['hip' + n], J['knee' + n], J['ankle' + n], J['toe' + n] = hip, k, a, toe
        sh = J['chest'] + R @ np.array([0.25 * side, 0.1, -0.02])
        swing = -run * 0.75 * math.sin(p) - crouch * 0.4               # the arm against its own leg
        out = 0.18 + 0.1 * run
        u = rot((1, 0, 0), lean_) @ rot((0, 0, 1), side * out) @ np.array([0, -math.cos(swing), math.sin(swing)])
        el = sh + u * 0.42                                          # the arms too long: past the knee
        bend = 0.5 + run * (0.45 + 0.35 * math.sin(p + 0.4)) + crouch * 0.6
        fu = rot((1, 0, 0), lean_) @ rot((0, 0, 1), side * out * 0.6) @ \
            np.array([0, -math.cos(swing + bend), math.sin(swing + bend)])
        wr = el + fu * 0.44
        tip = wr + fu * 0.22
        J['sh' + n], J['el' + n], J['wr' + n], J['tip' + n] = sh, el, wr, tip
    return J


class Rig:
    """A body built around the joints: the lumpy low-poly parts (each roughed up
    once, so it keeps its shape from frame to frame), tendrils rooted on it, and
    where the eyes and mouth sit."""

    def __init__(self, seed=13, tendrils=30):
        self.rng = np.random.RandomState(seed)
        r = self.rng
        self.jit = {}                                               # per-part vertex roughness, fixed
        self.roots = []                                             # tendrils: (bone, along, angle, length, phase)
        bones = ['chest', 'chest', 'spine', 'neck', 'upperL', 'upperR', 'thighL', 'thighR', 'foreL', 'foreR']
        for i in range(tendrils):                                    # most from the back and shoulders
            b = bones[r.randint(len(bones))]
            ang = r.uniform(2.2, 4.1) if b in ('chest', 'spine', 'neck') else r.uniform(0, 6.3)
            self.roots.append((b, r.uniform(0.1, 0.9), ang, r.uniform(0.2, 0.75), r.uniform(0, 6.3),
                               r.uniform(0.6, 1.4)))

    def _rough(self, key, n, amt):
        if key not in self.jit or len(self.jit[key]) != n:
            self.jit[key] = self.rng.uniform(-amt, amt, n)
        return self.jit[key]

    def _limb(self, m, key, pts, radii, sides=7, oid=2, colour=BODY, rough=0.12):
        v, f = tube(pts, radii, sides=sides)
        j = self._rough(key, len(v), rough)
        c = np.repeat(np.asarray(pts, float).mean(0)[None], len(v), 0)
        v = v + (v - c) * j[:, None] * 0.35
        m.add(v, f, colour, oid)

    def _blob(self, m, key, centre, radii, R=None, oid=2, sub=1, rough=0.12):
        v, f = blob((0, 0, 0), radii, sub)
        j = self._rough(key, len(v), rough)
        v = v * (1 + j[:, None])
        if R is not None:
            v = v @ np.asarray(R).T
        m.add(v + np.asarray(centre), f, BODY, oid)

    def bone_point(self, J, bone, along):
        a, b = {'thighL': ('hipL', 'kneeL'), 'thighR': ('hipR', 'kneeR'), 'shinL': ('kneeL', 'ankleL'),
                'shinR': ('kneeR', 'ankleR'), 'upperL': ('shL', 'elL'), 'upperR': ('shR', 'elR'),
                'foreL': ('elL', 'wrL'), 'foreR': ('elR', 'wrR'), 'spine': ('pelvis', 'chest'),
                'chest': ('spine', 'neck'), 'neck': ('neck', 'head')}[bone]
        return J[a] + (J[b] - J[a]) * along, J[b] - J[a]

    def body(self, J, grow=1.0):
        """The body mesh in body units (before the root transform)."""
        m = Mesh()
        mid = lambda a, b, t=0.5: J[a] + (J[b] - J[a]) * t
        for n in 'LR':
            self._limb(m, 'thigh' + n, [J['hip' + n], mid('hip' + n, 'knee' + n, 0.45), J['knee' + n]],
                       [0.12, 0.1, 0.07])
            self._limb(m, 'shin' + n, [J['knee' + n], mid('knee' + n, 'ankle' + n, 0.35), J['ankle' + n]],
                       [0.072, 0.07, 0.04])
            self._limb(m, 'foot' + n, [J['ankle' + n], J['toe' + n]], [0.048, 0.034], sides=5)
            self._limb(m, 'upper' + n, [J['sh' + n], mid('sh' + n, 'el' + n), J['el' + n]], [0.085, 0.07, 0.05])
            self._limb(m, 'fore' + n, [J['el' + n], mid('el' + n, 'wr' + n, 0.4), J['wr' + n]], [0.055, 0.05, 0.032])
            d = J['tip' + n] - J['wr' + n]
            for k in range(4):                                      # long thin fingers
                spread = (k - 1.5) * 0.35
                side = np.cross(d, (0, 1, 0))
                side = side / (np.linalg.norm(side) + 1e-9)
                tip = J['tip' + n] + side * spread * 0.07 + d * (0.25 if k in (1, 2) else 0)
                self._limb(m, 'finger%s%d' % (n, k), [J['wr' + n], (J['wr' + n] + tip) / 2 + side * spread * 0.02, tip],
                           [0.02, 0.015, 0.004], sides=4)
            self._blob(m, 'hand' + n, J['wr' + n] + d * 0.25, (0.05, 0.06, 0.035))
            self._blob(m, 'knee' + n, J['knee' + n], (0.08, 0.08, 0.08))
            self._blob(m, 'shoulder' + n, J['sh' + n], (0.11, 0.1, 0.11))
            self._blob(m, 'elbow' + n, J['el' + n], (0.055, 0.055, 0.055))
        self._blob(m, 'pelvis', J['pelvis'], (0.21, 0.14, 0.14), sub=1)
        self._limb(m, 'belly', [J['pelvis'], J['spine'], mid('spine', 'chest', 0.6)], [0.17, 0.15, 0.2], sides=8)
        self._blob(m, 'chest', mid('spine', 'neck', 0.6), (0.3, 0.23, 0.18), sub=1)
        self._blob(m, 'hunch', mid('chest', 'neck', 0.5) + np.array([0, 0.02, -0.07]), (0.2, 0.16, 0.14), sub=1)
        self._limb(m, 'neck', [J['neck'], mid('neck', 'head', 0.6)], [0.075, 0.06], sides=6)
        Rh = J['Rh']
        self._blob(m, 'head', J['head'] + Rh @ np.array([0, 0.02, 0]), (0.12, 0.17, 0.13), R=Rh, sub=2, rough=0.04)
        self._blob(m, 'jaw', J['head'] + Rh @ np.array([0, -0.085, 0.03]), (0.095, 0.075, 0.095), R=Rh, sub=1,
                   rough=0.05)
        for k, (bone, r0) in enumerate((('thighL', 0.12), ('thighR', 0.12), ('shinL', 0.075), ('shinR', 0.075),
                                       ('upperL', 0.085), ('upperR', 0.085), ('foreL', 0.056), ('foreR', 0.056),
                                       ('spine', 0.2), ('chest', 0.24))):
            for w in range(2 if bone in ('spine', 'chest') else 1):   # greed wrapped round and round it
                pts = self.wrap(J, bone, r0 * 1.06, k * 2 + w)
                v, f = tube(pts, 0.016 if bone in ('spine', 'chest') else 0.012, sides=5)
                m.add(v, f, BODY, 2)
        return m

    def wrap(self, J, bone, r, seed):
        """A band coiled round a bone, a few turns, ends loose."""
        rr = np.random.RandomState(seed)
        p0, ax = self.bone_point(J, bone, 0.05)
        L = np.linalg.norm(ax)
        ax = ax / (L + 1e-9)
        perp = np.cross(ax, (0, 0, 1) if abs(ax[2]) < 0.9 else (1, 0, 0))
        perp /= np.linalg.norm(perp) + 1e-9
        turns, a0 = rr.uniform(1.5, 3.0), rr.uniform(0, 6.3)
        n = 28
        pts = []
        for i in range(n):
            u = i / (n - 1)
            a = a0 + u * turns * 2 * math.pi
            off = rot(ax, a) @ perp * r * (1 + 0.15 * math.sin(u * 9 + seed))
            pts.append(p0 + ax * L * (0.05 + 0.85 * u) + off)
        return np.array(pts)

    def face(self, J):
        """Where the eyes and mouth are (body frame): eyes wide set and high, the
        mouth a flat frown."""
        Rh = J['Rh']
        h = J['head']
        eyes = [h + Rh @ np.array([s * 0.052, 0.04, 0.125]) for s in (-1, 1)]
        mouth = [h + Rh @ np.array([x, -0.06 + 0.01 * (abs(x) / 0.055) ** 2 - (0.018 if abs(x) < 0.006 else 0), 0.118])
                 for x in np.linspace(-0.055, 0.055, 11)]
        return eyes, mouth, h + Rh @ np.array([0, 0, 0.13])

    def tendril_paths(self, J, t, drag=np.zeros(3), grow=1.0):
        """Each tendril: from its root on the body, out and writhing, dragging
        back against the run."""
        out = []
        for (bone, along, ang, length, ph, speed) in self.roots:
            p, axis = self.bone_point(J, bone, along)
            axis = axis / (np.linalg.norm(axis) + 1e-9)
            perp = np.cross(axis, (0, 0, 1) if abs(axis[2]) < 0.9 else (1, 0, 0))
            perp /= np.linalg.norm(perp) + 1e-9
            normal = rot(axis, ang) @ perp
            L = length * grow
            pts = [p]
            d = normal.copy()
            side = np.cross(axis, normal)
            for k in range(1, 15):                                  # each step turns a little more: it coils
                u = k / 14
                d = rot(axis, 0.42 * math.sin(t * 2.2 * speed + ph + u * 5.0)) @ \
                    rot(side, 0.38 * math.sin(t * 1.7 * speed + ph * 1.7 + u * 6.0) + 0.12) @ d
                d /= np.linalg.norm(d) + 1e-9
                q = pts[-1] + (d * (1 - u * 0.3) + drag * u * 1.4) * (L / 14)
                pts.append(q)
            out.append(np.array(pts))
        return out

    def tendrils(self, J, t, drag=np.zeros(3), grow=1.0):
        m = Mesh()
        for i, pts in enumerate(self.tendril_paths(J, t, drag, grow)):
            r0 = 0.03 * self.roots[i][5]
            v, f = tube(pts, np.linspace(r0, 0.002, len(pts)), sides=5)
            m.add(v, f, BODY, 3)
        return m


def place(mesh_or_pts, pos, yaw, scale=SCALE):
    """Body frame -> world: scale, turn to face `yaw`, move to pos."""
    R = rot((0, 1, 0), yaw) * scale
    if isinstance(mesh_or_pts, Mesh):
        out = Mesh()
        for v, f, c, o in zip(mesh_or_pts.v, mesh_or_pts.f, mesh_or_pts.c, mesh_or_pts.o):
            out.v.append((v @ R.T + pos).astype(np.float32))
            out.f.append(f)
            out.c.append(c)
            out.o.append(o)
        out.n = mesh_or_pts.n
        return out
    return np.asarray(mesh_or_pts) @ R.T + pos
