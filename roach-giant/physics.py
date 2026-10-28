"""The physics the film runs on, simulated once and kept.

The swarm: every roach a boid - it keeps its distance from its neighbours,
turns with them, and steers for where it wants to be (out over the fields
while they feed, then back in to the feet of the thing they are becoming) -
with its own top speed and turn rate, and a size that grows as it drains the
rice. The old pine: a rigid body falling about its foot under gravity once it
is dead, bouncing when it hits. The camera: a spring knocked by every footstep,
the breath, the pine's fall. The trees: each one knocked by the footsteps near
it, ringing down.
"""
import math
import os
import pickle

import numpy as np
from numba import njit

import timeline as TL
from terrain import in_paddies, dike_dist

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache', 'flock_v3.pkl')


# ---------------------------------------------------------------- the swarm
@njit(cache=True)
def _step(x, z, vx, vz, active, goal_x, goal_z, size, vmax, sep_k, align_k, dt, cell, gx0, gz0, gn):
    n = x.shape[0]
    # bin them into a grid
    head = np.full(gn * gn, -1, np.int64)
    nxt = np.full(n, -1, np.int64)
    for i in range(n):
        if not active[i]:
            continue
        cx = int((x[i] - gx0) / cell)
        cz = int((z[i] - gz0) / cell)
        if cx < 0 or cz < 0 or cx >= gn or cz >= gn:
            continue
        k = cz * gn + cx
        nxt[i] = head[k]
        head[k] = i
    ax = np.zeros(n)
    az = np.zeros(n)
    for i in range(n):
        if not active[i]:
            continue
        cx = int((x[i] - gx0) / cell)
        cz = int((z[i] - gz0) / cell)
        sx = 0.0
        sz = 0.0
        avx = 0.0
        avz = 0.0
        cnt = 0
        r = size[i] * 1.3 + 0.02
        for ox in range(-1, 2):
            for oz in range(-1, 2):
                qx = cx + ox
                qz = cz + oz
                if qx < 0 or qz < 0 or qx >= gn or qz >= gn:
                    continue
                j = head[qz * gn + qx]
                while j >= 0:
                    if j != i:
                        dx = x[i] - x[j]
                        dz = z[i] - z[j]
                        d2 = dx * dx + dz * dz
                        rr = r + size[j] * 0.3
                        if d2 < rr * rr * 4 and d2 > 1e-10:
                            d = math.sqrt(d2)
                            if d < rr:
                                w = (rr - d) / rr
                                sx += dx / d * w
                                sz += dz / d * w
                            avx += vx[j]
                            avz += vz[j]
                            cnt += 1
                    j = nxt[j]
        # steer for the goal
        gx = goal_x[i] - x[i]
        gz = goal_z[i] - z[i]
        gd = math.sqrt(gx * gx + gz * gz) + 1e-9
        want = min(vmax[i], gd * 1.5)
        dvx = gx / gd * want - vx[i]
        dvz = gz / gd * want - vz[i]
        ax[i] = dvx * 2.5 + sx * sep_k * vmax[i]
        az[i] = dvz * 2.5 + sz * sep_k * vmax[i]
        if cnt > 0:
            ax[i] += (avx / cnt - vx[i]) * align_k
            az[i] += (avz / cnt - vz[i]) * align_k
    for i in range(n):
        if not active[i]:
            continue
        vx[i] += ax[i] * dt
        vz[i] += az[i] * dt
        sp = math.sqrt(vx[i] * vx[i] + vz[i] * vz[i])
        if sp > vmax[i] * 1.2:
            vx[i] *= vmax[i] * 1.2 / sp
            vz[i] *= vmax[i] * 1.2 / sp
        x[i] += vx[i] * dt
        z[i] += vz[i] * dt


class Flock:
    """The swarm from the first roaches surfacing to the last climbing into it."""

    def __init__(self, n_body, arrive, feet, seed=12, n_extra=3000):
        import hashlib
        src = open(__file__).read() + open(os.path.join(HERE, 'timeline.py')).read()
        key = (n_body, n_extra, seed, round(float(arrive.sum()), 3), hashlib.md5(src.encode()).hexdigest())
        if os.path.exists(CACHE):
            with open(CACHE, 'rb') as fh:
                d = pickle.load(fh)
            if d['key'] == key:
                self.__dict__.update(d['data'])
                return
        r = np.random.RandomState(seed)
        n = n_body + n_extra
        self.n, self.n_body = n, n_body
        # where each comes up out of the water: spreading out from the middle of the fields
        k = np.arange(n)
        self.t_out = TL.T_SURFACE + 5.5 * (r.rand(n) ** 0.6)
        self.t_out[0] = 0.0                                            # the first one is there from the start
        rad = 6 + 150 * np.sqrt(r.rand(n)) * np.clip((self.t_out - TL.T_SURFACE) / 5.5, 0.08, 1)
        ang = r.uniform(0, 2 * math.pi, n)
        self.x0 = TL.F[0] + np.cos(ang) * rad
        self.z0 = TL.F[2] + np.sin(ang) * rad
        self.x0[0], self.z0[0] = TL.HERO[0], TL.HERO[2]
        self.Lmax = r.uniform(1.6, 2.6, n)
        self.arrive = np.r_[arrive, r.uniform(TL.T_FORM[0] - 0.5, TL.T_FORM[1] - 0.6, n_extra)]
        self.turn = r.uniform(15.5, 18.0, n)
        self.wx = self.x0 + r.normal(0, 30, n)                          # where each drifts while it feeds
        self.wz = self.z0 + r.normal(0, 30, n)
        feet_all = np.vstack([feet, feet[r.randint(0, len(feet), n_extra)]])
        self.fx, self.fz = feet_all[:, 0], feet_all[:, 2]
        self.t0, self.t1, self.fps = TL.T_SURFACE - 0.5, TL.T_FORM[1] + 0.8, TL.FPS
        self._simulate(r)
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, 'wb') as fh:
            pickle.dump(dict(key=key, data=self.__dict__), fh, protocol=4)

    def size(self, t):
        g = np.clip((t - TL.T_SURFACE - 1.0) / (TL.T_FORM[0] - TL.T_SURFACE - 1.0), 0, 1)
        return 0.06 + (self.Lmax - 0.06) * g ** 1.6

    def _simulate(self, r):
        n = self.n
        x, z = self.x0.copy(), self.z0.copy()
        vx = r.normal(0, 0.3, n)
        vz = r.normal(0, 0.3, n)
        dt = 1.0 / 60
        steps = int((self.t1 - self.t0) / dt) + 1
        frames_x, frames_z, frames_h, frames_d = [], [], [], []
        dist = np.zeros(n)
        nxt = self.t0
        cell = 6.0
        gx0, gz0, gn = TL.F[0] - 330, TL.F[2] - 330, 110
        for s in range(steps):
            t = self.t0 + s * dt
            active = (t >= self.t_out) & (t < self.arrive - 1.3)
            L = self.size(t)
            vmax = 3.0 + L * 5.5
            back = t >= self.turn
            # feeding: wander; then home on the feet
            wob = 6.0 * np.sin(t * 0.7 + np.arange(n) * 0.37)
            gxg = np.where(back, self.fx, self.wx + wob)
            gzg = np.where(back, self.fz, self.wz + np.cos(t * 0.6 + np.arange(n)) * 6.0)
            ox, oz = x.copy(), z.copy()
            _step(x, z, vx, vz, active, gxg, gzg, L, vmax, 2.2, 0.6, dt, cell, gx0, gz0, gn)
            dist += np.hypot(x - ox, z - oz)
            if t + 1e-9 >= nxt:
                frames_x.append(x.astype(np.float32).copy())
                frames_z.append(z.astype(np.float32).copy())
                frames_h.append(np.arctan2(vz, vx).astype(np.float32))
                frames_d.append(dist.astype(np.float32).copy())
                nxt += 1.0 / self.fps
        self.X = np.array(frames_x)
        self.Z = np.array(frames_z)
        self.Hd = np.array(frames_h)
        self.D = np.array(frames_d)

    def at(self, t):
        i = int(np.clip(round((t - self.t0) * self.fps), 0, len(self.X) - 1))
        return self.X[i], self.Z[i], self.Hd[i], self.D[i]


# ---------------------------------------------------------------- the pine, falling
class Topple:
    """theta'' = (3 g / 2 L) sin theta for a rod pivoting on its foot; it
    lands on the ground and bounces a little."""

    def __init__(self, t0, L=34.0, theta0=0.06, w0=0.05):
        self.t0 = t0
        dt = 1 / 240
        th, w = theta0, w0
        self.ts, self.th = [t0], [th]
        t = t0
        bounced = 0
        while t < t0 + 8:
            a = 1.5 * 9.8 / L * math.sin(th) - 0.15 * w
            w += a * dt
            th += w * dt
            if th >= 1.5 and w > 0:                                  # down: bounce, settle
                th = 1.5
                w = -w * (0.22 if bounced < 2 else 0.0)
                bounced += 1
            t += dt
            self.ts.append(t)
            self.th.append(th)
        self.ts = np.array(self.ts)
        self.th = np.array(self.th)
        self.t_land = float(self.ts[np.argmax(self.th >= 1.5)])

    def __call__(self, t):
        if t < self.t0:
            return 0.0
        return float(np.interp(t, self.ts, self.th))


# ---------------------------------------------------------------- knocks
def ring(t, events, f=6.0, decay=0.35):
    """Sum of damped oscillations started by (time, strength) events."""
    out = 0.0
    for (t0, a) in events:
        u = t - t0
        if 0 <= u < decay * 8:
            out += a * math.exp(-u / decay) * math.sin(2 * math.pi * f * u)
    return out


def camera_shake(t, events):
    """A spring on the camera: three axes knocked by each event."""
    return np.array([ring(t, events, 7.0, 0.3), ring(t + 0.11, events, 5.3, 0.38) * 0.7,
                     ring(t + 0.23, events, 6.1, 0.32) * 0.8])


def tree_shake(t, pos, steps, reach=130.0):
    """How far each tree leans from the footsteps near it (radians)."""
    out = np.zeros(len(pos))
    for (t0, foot, x, z) in steps:
        u = t - t0
        if u < 0 or u > 4:
            continue
        d = np.hypot(pos[:, 0] - x, pos[:, 2] - z)
        near = d < reach
        if near.any():
            out[near] += 0.06 * (1 - d[near] / reach) ** 2 * math.exp(-u / 0.8) * math.sin(2 * math.pi * 1.4 * u)
    return out
