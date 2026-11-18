"""Animate and export the plush and the charm (kit3d.py) into traveler_kit/.

    python3 kit3d_build.py [plush] [charm] [-j 3]

  seal_plush_<variant>     clean, worn, dirty, repaired, torn
      turn     24 frames, a full turn (drag to rotate through it)
      idle     16, settling and breathing like a soft thing does, flippers
      squish   20, a squeeze: a little rise, squashed flat, springs back
               wobbling; a puff of dust; the torn one loses stuffing
      wiggle   16, (clean) it wriggles, head and tail swinging
      roar     24, (clean) the beast in it: fur bristles, mouth gapes on its
               felt fangs, flippers up, a shudder, then it settles
  omamori_charm_<variant>  clean, worn, dirty, repaired
      turn     24, idle 24 (it sways on its loop), jingle 24 (flicked: it
      swings out and back, the bell rings with a glint, the tassel trails)"""
import math
import sys
from multiprocessing import Pool
import numpy as np
import kit3d as K
from kit_export import export_prop
from sculpt import rot_x, rot_y

FPS = 12
TAU = 2 * math.pi


# ---------------------------------------------------------------- poses
def plush_anims(variant):
    A = {}
    A['turn'] = [dict(yaw=0.75 + TAU * k / 24) for k in range(24)]
    A['idle'] = [dict(squash=(1 - 0.012 * math.sin(TAU * k / 16), 1 + 0.02 * math.sin(TAU * k / 16)),
                      flap=0.18 + 0.16 * math.sin(TAU * k / 16 + 1.0), head=0.04 * math.sin(TAU * k / 16 + 0.4),
                      eye_swing=0.5 * math.sin(TAU * k / 16)) for k in range(16)]
    sq = []
    for f in range(20):
        if f < 3:
            u = (f + 1) / 3
            sx, sy, flap, fluff, amp = 1 - 0.04 * u, 1 + 0.07 * u, 0.25 * u, 0.0, 0.0
        else:
            e = f - 3
            amp = math.exp(-e / 3.4) * math.cos(e * 1.0)
            sx, sy = 1 + 0.2 * amp, 1 - 0.27 * amp
            flap, fluff = max(0.0, amp) * 1.0, 0.5 * abs(amp)
        sq.append(dict(squash=(sx, sy), flap=flap, fluff=fluff, spill=max(0.0, amp) * 1.3,
                       eye_swing=3.0 * amp, _amp=amp, _f=f))
    A['squish'] = sq
    if variant == 'clean':
        A['wiggle'] = [dict(wiggle=0.55 * math.sin(TAU * k / 16 * 2), head=0.28 * math.sin(TAU * k / 16 * 2 + 0.7),
                            flap=0.5 + 0.5 * math.sin(TAU * k / 16 * 4)) for k in range(16)]
        ro = []
        for f in range(24):
            if f < 5:
                u = f / 5
                r, sx, sy = 0.0, 1 - 0.03 * u, 1 + 0.05 * u
            elif f < 9:
                u = (f - 4) / 4
                r, sx, sy = 1 - (1 - u) ** 2, 1.05, 0.96
            elif f < 18:
                r = 1.0 + 0.06 * math.sin(f * 2.6)
                sx, sy = 1.05 + 0.02 * math.sin(f * 3.1), 0.96 - 0.02 * math.sin(f * 3.1)
            else:
                u = (f - 17) / 6
                r, sx, sy = (1 - u) ** 2, 1 + 0.05 * (1 - u), 1 - 0.04 * (1 - u)
            ro.append(dict(roar=r, fluff=r, flap=0.8 * r, squash=(sx, sy), head=0.06 * math.sin(f * 2.2) * r))
        A['roar'] = ro
    return A


def charm_anims():
    A = {}
    A['turn'] = [dict(yaw=0.4 + TAU * k / 24) for k in range(24)]
    A['idle'] = [dict(swing=0.05 * math.sin(TAU * k / 24), bell=0.08 * math.sin(TAU * k / 24 - 0.8),
                      flutter=0.12 * math.sin(TAU * k / 24 - 1.3)) for k in range(24)]
    ji = []
    for f in range(24):
        t = f / FPS
        sw = 0.42 * math.exp(-t / 0.6) * math.sin(TAU * 1.3 * t + 0.2) if f > 0 else 0.0
        bl = -0.5 * math.exp(-t / 0.5) * math.sin(TAU * 1.3 * t - 0.6) if f > 0 else 0.0
        fl = -0.6 * math.exp(-t / 0.55) * math.sin(TAU * 1.3 * t - 0.9) if f > 0 else 0.0
        ji.append(dict(swing=sw, bell=bl, flutter=fl, _f=f))
    A['jingle'] = ji
    return A


# ---------------------------------------------------------------- effects drawn over the frames
def _px(a, x, y, c, al=255):
    h, w = a.shape[:2]
    x, y = int(round(x)), int(round(y))
    if 0 <= x < w and 0 <= y < h:
        a[y, x, :3] = c
        a[y, x, 3] = max(a[y, x, 3], al)


def _puff(a, x, y, r, c, rim):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = dx * dx + dy * dy
            if d <= r * r:
                _px(a, x + dx, y + dy, rim if d > (r - 1) * (r - 1) and dy >= 0 else c)


def plush_fx(a, pose, variant, anim):
    if anim != 'squish':
        return a
    f, amp = pose['_f'], pose['_amp']
    sx, sy = pose['squash']
    V = rot_x(0.22) @ rot_y(-0.75)
    ox, oy = K.PLUSH_ORIGIN
    sc = K.PLUSH_SCALE

    def proj(p):
        v = V @ (np.asarray(p) * (sx, sy, sx))
        return ox + v[0] * sc, oy - v[1] * sc
    if 4 <= f <= 10:                                   # dust puffs out from under it on the landing
        u = (f - 4) / 6
        for s in (-1, 1):
            for k in range(3):
                bx, by = proj((s * (1.1 + 0.5 * u) - 0.1, 0.0, 0.25 * k - 0.25))
                r = int(round(1 + 2 * (1 - abs(u - 0.4))))
                if (f + k) % 3 != 2 or u < 0.5:
                    _puff(a, bx + s * k * 2, by - k - 2 * u, max(1, r - (k > 1)), (214, 204, 182), (176, 164, 142))
    if variant in ('torn', 'worn') and 4 <= f <= 16:   # stuffing flies out of the rips and drops
        rng = np.random.RandomState(4 if variant == 'torn' else 9)
        for (c, nrm, r, n) in K._tears(K.VARIANTS[variant]['damage']):
            for k in range(4 if variant == 'torn' else 2):
                v0 = nrm * rng.uniform(1.2, 2.0) + rng.normal(0, 0.4, 3) + (0, 1.6, 0)
                t = (f - 4) / FPS
                p = c + v0 * t * 1.2 + np.array((0, -4.0, 0)) * t * t
                x, y = proj(p)
                _puff(a, x, y, 2 if k % 2 == 0 else 1, K.R['cotton'][3], K.R['cotton'][1])
    return a


def charm_fx(a, pose, variant, anim):
    if anim != 'jingle' or not (1 <= pose['_f'] <= 13):
        return a
    f = pose['_f']
    sw, bl = pose['swing'], pose['bell']
    ba = 0.55 - sw * 0.7 + bl
    bp = np.array((0.2, -0.66, 0.08))
    bc = bp + np.array((0.6 * math.sin(ba), -0.6 * math.cos(ba), 0.12))
    from sculpt import rot_z
    p = rot_z(sw) @ bc
    V = rot_x(0.12) @ rot_y(-0.4)
    v = V @ p
    x, y = K.CHARM_ORIGIN[0] + v[0] * K.CHARM_SCALE, K.CHARM_ORIGIN[1] - v[1] * K.CHARM_SCALE
    gold = K.R['gold']
    for k, (dx, dy) in enumerate(((9, -6), (-8, -9), (11, 5))):         # little stars ringing off the bell
        life = f - 1 - k * 2
        if 0 <= life <= 6:
            r = (1, 2, 3, 2, 2, 1, 1)[life]
            cx, cy = x + dx + life * np.sign(dx) * 0.6, y + dy - life * 0.5
            for i in range(-r, r + 1):
                c = gold[4] if abs(i) < 1 else gold[3]
                _px(a, cx + i, cy, c)
                _px(a, cx, cy + i, c)
    return a


# ---------------------------------------------------------------- rendering
def _job(args):
    kind, variant, anim, i, pose = args
    kw = {k: v for k, v in pose.items() if not k.startswith('_')}
    if kind == 'plush':
        a = K.render_plush(variant=variant, **kw)
        return plush_fx(a, pose, variant, anim)
    a = K.render_charm(variant=variant, **kw)
    return charm_fx(a, pose, variant, anim)


def build(which=('plush', 'charm'), procs=3):
    jobs, plan = [], []
    if 'plush' in which:
        for v in K.VARIANTS:
            for an, poses in plush_anims(v).items():
                plan.append(('plush', v, an, len(poses)))
                jobs += [('plush', v, an, i, p) for i, p in enumerate(poses)]
    if 'charm' in which:
        for v in K.CHARM_VARIANTS:
            for an, poses in charm_anims().items():
                plan.append(('charm', v, an, len(poses)))
                jobs += [('charm', v, an, i, p) for i, p in enumerate(poses)]
    print(f'{len(jobs)} frames')
    with Pool(procs) as pool:
        frames = pool.map(_job, jobs, chunksize=4)
    k = 0
    out = {}
    for (kind, v, an, n) in plan:
        name = ('seal_plush_' if kind == 'plush' else 'omamori_charm_') + v
        out.setdefault(name, {})[an] = frames[k:k + n]
        k += n
    order = ('turn', 'idle', 'squish', 'wiggle', 'roar', 'jingle')
    for name, anims in out.items():
        anims = {a: anims[a] for a in sorted(anims, key=lambda x: order.index(x) if x in order else 99)}
        # the still is a three-quarter view, the first frame of the turn
        export_prop(name, anims, fps=FPS)
        print('  ' + name + ': ' + ', '.join(f'{a} {len(f)}' for a, f in anims.items()))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    j = int(sys.argv[sys.argv.index('-j') + 1]) if '-j' in sys.argv else 3
    args = [a for a in args if not a.isdigit()]
    build(tuple(args) or ('plush', 'charm'), j)
