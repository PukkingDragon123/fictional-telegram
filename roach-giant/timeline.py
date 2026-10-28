"""When and where things happen in the film (shared by the film, the creature
and the soundtrack)."""
import math

import numpy as np

FPS = 30
F = np.array([60.0, 0.0, 600.0])          # where the roaches gather and it rises (the middle of the rice field)
PINE = np.array([230.0, 0.0, 260.0])
P_END = np.array([196.0, 0.0, 318.0])
HERO = np.array([18.0, 0.0, 571.0])      # the first roach, on a dike

SHOTS = [('paddy', 0.0, 8.5), ('rising', 8.5, 13.5), ('tide', 13.5, 19.5), ('rise', 19.5, 28.5),
         ('breath', 28.5, 33.5), ('walk', 33.5, 39.0), ('walk_low', 39.0, 43.0), ('pine', 43.0, 51.0),
         ('face', 51.0, 58.0), ('reach', 58.0, 62.0), ('title', 62.0, 68.0)]
END = SHOTS[-1][2]
T_HERO_TURN = 5.6
T_SURFACE = 8.6                           # the water starts to boil with them
T_POUR = 10.0
T_FORM = (20.0, 26.5)
T_REVEAL = 27.2                           # they crawl away from its face
T_EYES = 28.0
T_BREATH = 29.6
T_WALK = 33.5
T_STOP = 42.6
T_DRINK = (45.6, 48.6)
T_TOPPLE = 48.9
T_JAW = 54.2
T_CUT = 61.95


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
    return float(kf(t, [(10.0, 0.0), (19.0, 0.4), (28.0, 0.85), (31.0, 1.0)]))


def path_yaw():
    d = P_END - F
    return math.atan2(d[0], d[2])


def walk_steps(stride=27.0, dt=0.74, side=7.5):
    """Foot plants on the walk: (time the foot lands, which foot, x, z)."""
    d = P_END - F
    L = float(np.linalg.norm(d))
    u = d / L
    perp = np.array([u[2], 0, -u[0]])
    n = int(L / stride)
    out = []
    for k in range(1, n + 2):
        s = min(L, k * stride - stride / 2)
        foot = 'L' if k % 2 else 'R'
        p = F + u * s + perp * (-side if foot == 'L' else side)            # perp points to its right
        out.append((T_WALK + 0.5 + (k - 1) * dt, foot, p[0], p[2]))
    return out


STEPS = walk_steps()
