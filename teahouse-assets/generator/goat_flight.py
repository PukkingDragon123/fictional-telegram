"""The goat-dragon flying: the old goat-dragon from the tea-room window (see
wyvern.py), all of him - goat head with ridged horns, amber bar-pupil eyes, a
pink nose with a gold ring and gold hoops in the ears, a shaggy white mane and
beard, pearly teal-edged scales, cream belly plates, grey spines, tucked goat
legs with dark hooves, a long tail ending in a tuft, and big lilac wings.

He is built as a low-poly 3D model and rendered to pixel art in the teahouse
palette: drawn four times bigger, brought down to pixels by material, each
material shaded with its own colour ramp, then outlined the way the rest of
the pack is.

  fly    16 frames, 12 fps: a slow, heavy wingbeat (the wings fold on the upstroke)
  glide  12 frames, 12 fps: wings held out, riding the air
  toward 16 frames, 12 fps: flying at the viewer, three-quarter front

    python goat_flight.py OUT_DIR
"""
import math
import os
import sys

import numpy as np
from PIL import Image

from pixel import Canvas, PAL
from objects import outline
from raster3d import Mesh, tube, blob, rot, Camera, render

FW, FH = 256, 192              # one frame at 1x
K = 4                          # rendered this much bigger, then brought down to pixels
MATS = {                        # material: colour ramp, dark to light
    'fur': ('stone2', 'stone3', 'stone4', 'cloud2', 'cloud3', 'white'),
    'scale': ('teal0', 'teal1', 'teal2', 'stone3', 'stone4', 'cloud2'),
    'plate': ('paper0', 'paper1', 'paper2', 'paper3', 'paper4'),
    'horn': ('stone1', 'stone2', 'paper1', 'paper2', 'paper3', 'paper4'),
    'nose': ('pink0', 'pink1', 'pink2', 'pink3', 'pink4'),
    'iris': ('copper1', 'gold1', 'gold2', 'gold3'),
    'pupil': ('ink', 'ink'),
    'wing': ('lilac0', 'lilac1', 'lilac2', 'lilac3', 'lilac4'),
    'bone': ('stone1', 'stone2', 'stone3', 'stone4', 'cloud2'),
    'gold': ('gold0', 'gold1', 'gold2', 'gold3', 'gold4'),
    'hoof': ('ink', 'stone0', 'stone1', 'stone2'),
    'spine': ('stone0', 'stone1', 'stone2', 'stone3', 'stone4'),
    'ear': ('pink1', 'pink2', 'pink3', 'pink4'),
}
MID = {name: i + 1 for i, name in enumerate(MATS)}
BIAS = {'fur': 0.12, 'plate': 0.05, 'wing': 0.0, 'horn': 0.05, 'iris': 0.25}   # some materials sit lighter
LIGHT = (-0.45, 0.8, 0.5)


def _rgb(name):
    return np.array(PAL[name], np.float32)


RAMP = {k: np.array([_rgb(c) for c in v]) for k, v in MATS.items()}


# ---------------------------------------------------------------- the model
class Model:
    """Each part gets its own fixed roughness, so the facets (his fur, his
    scales) stay put from frame to frame."""

    def __init__(self):
        self.m = Mesh()
        self.seed = 0

    def add(self, v, f, mat, jit=0.1, by_normal=False):
        r = np.random.RandomState(self.seed)
        self.seed += 1
        col = np.full((len(f), 3), 200.0, np.float32) * r.uniform(1 - jit, 1 + jit, (len(f), 1))
        oid = np.full(len(f), MID[mat], np.int32)
        if by_normal:                                                # fur on top, scales on the sides, plates below
            p = np.asarray(v)[f]
            n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
            n /= -(np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)    # tubes wind inward
            oid = np.where(n[:, 1] > by_normal[0], MID['fur'], np.where(n[:, 1] < by_normal[1], MID['plate'],
                                                                         MID['scale'])).astype(np.int32)
        self.m.add(v, f, col, 0)
        self.m.o[-1] = oid
        return self

    def tube(self, pts, radii, mat, sides=7, jit=0.1, by_normal=False, rough=0.0):
        radii = np.atleast_1d(np.asarray(radii, float))
        if len(radii) > 1 and len(radii) != len(pts):               # control-point radii along a denser curve
            radii = np.interp(np.linspace(0, 1, len(pts)), np.linspace(0, 1, len(radii)), radii)
        v, f = tube(pts, radii, sides=sides, jitter=rough, rng=np.random.RandomState(self.seed + 500))
        return self.add(v, f, mat, jit, by_normal)

    def blob(self, c, r, mat, sub=1, jit=0.1, R=None, rough=0.08):
        v, f = blob((0, 0, 0), r, sub=sub, rng=np.random.RandomState(self.seed + 900), jitter=rough)
        if R is not None:
            v = v @ np.asarray(R, np.float32).T
        return self.add(v + np.asarray(c, np.float32), f, mat, jit)

    def cone(self, base, tip, r, mat, sides=4, jit=0.1):
        return self.tube([base, tip], [r, 0.05], mat, sides=sides, jit=jit)

    def ring(self, c, r, t, axis, mat):
        a = np.linspace(0, 2 * math.pi, 10)
        u = np.cross(axis, (0, 0, 1) if abs(axis[2]) < 0.9 else (1, 0, 0))
        u /= np.linalg.norm(u)
        w = np.cross(axis, u)
        pts = [np.asarray(c) + (u * math.cos(x) + w * math.sin(x)) * r for x in a]
        return self.tube(pts, t, mat, sides=4, jit=0.05)


def _curve(pts, n=3):
    """A smooth curve through a few points (Catmull-Rom), as a denser polyline."""
    P = [np.asarray(p, float) for p in pts]
    P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1:i + 3]
        for k in range(n):
            t = k / n
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return np.array(out)


def wing(md, s, th, fold, lag):
    """One wing (s = +1 near, -1 far): arm and three long fingers with a
    scalloped lilac membrane between them, raised th, folded back by fold,
    the outer hand trailing by lag."""
    S = np.array([18.0, 12.0, 9.0 * s])
    loc = dict(E=(-6, 3, 24), R=(-10, 3, 50), F1=(-4, 0, 84), F2=(-28, -1, 78), F3=(-46, -1, 58), F4=(-50, -1, 32))
    P = {k: np.array([v[0], v[1], v[2] * s], float) for k, v in loc.items()}
    Rf = rot((0, 1, 0), -s * fold)
    for k in ('R', 'F1', 'F2', 'F3', 'F4'):
        P[k] = P['E'] + Rf @ (P[k] - P['E'])
    Rl = rot((1, 0, 0), -s * lag)
    for k in ('F1', 'F2', 'F3', 'F4'):
        P[k] = P['R'] + Rl @ (P[k] - P['R'])
    Rs = rot((1, 0, 0), -s * th)
    P = {k: S + Rs @ v for k, v in P.items()}
    P['S'], Hp = S, np.array([-30.0, 8.0, 10.0 * s])
    md.tube([P['S'], P['E'], P['R']], [2.6, 2.1, 1.6], 'bone', sides=5)
    md.blob(P['R'], (2.2, 2.2, 2.2), 'bone', sub=0)
    md.cone(P['R'], P['R'] + (P['R'] - P['E']) / np.linalg.norm(P['R'] - P['E']) * 5, 1.5, 'bone')   # the thumb claw
    for k in ('F1', 'F2', 'F3', 'F4'):
        md.tube([P['R'], P[k]], [1.4, 0.35], 'bone', sides=4)
    edge = [P['F1'], P['F2'], P['F3'], P['F4'], Hp]
    pts = [P['R'], P['S'], P['E']]
    tri = [(0, 1, 2)]
    prev = None
    for i in range(len(edge)):
        pts.append(edge[i])
        cur = len(pts) - 1
        if prev is not None:
            tri.append((0, prev, cur))
        if i < len(edge) - 1:                                        # the trailing edge sags between fingers
            mid = (edge[i] + edge[i + 1]) / 2
            mid = mid + (P['R'] - mid) * 0.24
            pts.append(mid)
            tri.append((0, cur, len(pts) - 1))
            prev = len(pts) - 1
    tri.append((0, len(pts) - 1, 1))
    md.add(np.array(pts, np.float32), np.array(tri, np.int32), 'wing', jit=0.05)


def build(phase, kind='fly'):
    """The goat-dragon at a point in his wingbeat (phase, radians)."""
    md = Model()
    if kind == 'glide':
        th, fold, lag = 0.12 + 0.05 * math.sin(phase), 0.05, 0.1 * math.sin(phase + 1)
        bob = 1.2 * math.sin(phase)
    else:
        th = 0.95 * math.cos(phase)                                  # up at 0, down at pi
        fold = 0.6 * max(0.0, -math.sin(phase)) ** 1.3                # folds on the way back up
        lag = -0.38 * math.sin(phase)                                # the tips trail the stroke
        bob = -3.0 * math.cos(phase)
    up = np.array([0, bob, 0.0])
    w = 1.0 if kind != 'glide' else 0.35
    # trunk
    trunk = [(-32, 0), (-18, 1), (0, 2), (16, 3), (28, 5)]
    TR = [13, 17.5, 19.5, 19, 15]
    tp = _curve([(x, y, 0) for x, y in trunk], 3)
    v, f = tube(tp, np.interp(np.linspace(0, 1, len(tp)), np.linspace(0, 1, 5), TR), sides=16, jitter=0.05,
                rng=np.random.RandomState(1))
    v[:, 2] *= 0.86
    md.add(v + up, f, 'fur', 0.12, by_normal=(0.45, -0.5))
    # neck and head: the head counters the wingbeat a little
    nod = 0.08 * math.sin(phase + 0.6) * w
    neck = _curve([(26, 6, 0), (38, 14, 0), (48, 24, 0), (56, 31, 0)], 3)
    md.tube(neck + up, np.linspace(13.5, 9.0, len(neck)), 'fur', sides=12, jit=0.12, by_normal=(0.3, -0.45),
            rough=0.06)
    Rh = rot((0, 0, 1), -0.12 + nod) * 1.4                         # a big old head
    hc = np.array([57.0, 32.0, 0]) + up
    H = lambda p: hc + Rh @ (np.asarray(p, float) - np.array([57.0, 32.0, 0]))
    md.blob(H((61, 35, 0)), (8.6, 8.2, 7.0), 'fur', sub=1, jit=0.1)
    md.tube([H((65, 34, 0)), H((74, 30.5, 0)), H((82, 25.5, 0))], [6.8, 5.6, 4.4], 'fur', sides=8, jit=0.1)
    md.tube([H((68, 31.5, 0)), H((76, 30, 0)), H((81, 27, 0))], [3.4, 3.0, 2.4], 'scale', sides=6, jit=0.25)  # bridge
    md.blob(H((83.2, 25.2, 0)), (3.4, 3.6, 3.8), 'nose', sub=1, jit=0.05)
    md.tube([H((66, 28.5, 0)), H((73, 25, 0)), H((80, 21.5, 0))], [4.6, 3.6, 2.6], 'fur', sides=6)          # jaw
    for k in range(5):                                                # a wispy goatee, a few locks
        dz, dx = (k - 2) * 0.8, (k % 2) * 1.2
        md.tube([H((76 - dx, 21.5, dz)), H((74.5 - dx, 17.5, dz * 1.2)), H((72 - dx * 1.5, 13.5 + k % 3, dz))],
                [1.4, 0.9, 0.2], 'plate', sides=4, jit=0.15)
    md.ring(H((83.6, 21.4, 0)), 1.9, 0.55, np.array([1.0, 0, 0]), 'gold')                                     # nose ring
    for s in (1, -1):
        md.blob(H((68.8, 35.2, 6.6 * s)), (2.5, 1.9, 1.0), 'iris', sub=1, jit=0.02, rough=0.0)
        md.blob(H((69.0, 35.2, 7.4 * s)), (1.7, 0.6, 0.3), 'pupil', sub=0, jit=0.0, rough=0.0)
        md.blob(H((67.5, 37.4, 6.2 * s)), (3.6, 1.2, 1.6), 'fur', sub=0, jit=0.05)                      # the brow
        md.blob(H((66.5, 33, 5.5 * s)), (5, 4, 2.2), 'scale', sub=1, jit=0.3)                               # cheek scales
        horn = _curve([(61, 41, 4 * s), (56, 46.5, 5 * s), (49, 47.5, 6.5 * s), (44, 43.5, 7.5 * s),
                       (44, 37.5, 8 * s), (48.5, 35, 8 * s), (51.5, 37.5, 7.5 * s)], 3)
        rad = np.linspace(3.2, 0.9, len(horn)) * (1 + 0.16 * (np.arange(len(horn)) % 2))          # growth ridges
        md.tube(np.array([H(p) for p in horn]), rad, 'horn', sides=6, jit=0.08)
        er = rot((0, 0, 1), -0.55 + 0.1 * math.sin(phase * (1 if kind != 'glide' else 0)))
        ec = H((55, 34.5, 7.8 * s))
        md.blob(ec, (6.2, 2.3, 1.1), 'fur', sub=1, R=er)                                                  # floppy ear
        md.blob(ec + np.array([0, 0, 0.6 * s]), (4.6, 1.5, 0.6), 'ear', sub=1, R=er)
        md.ring(ec + er @ np.array([-4.5, -1.6, 0.4 * s]), 1.3, 0.4, np.array([0, 0, 1.0]), 'gold')       # ear hoop
    # mane and spines
    r = np.random.RandomState(3)
    for i, p in enumerate(neck[1:-1]):
        b = p + up + np.array([0, 8.5, 0])
        for _ in range(4):
            md.cone(b + r.uniform(-2, 2, 3), b + np.array([-8, 5.5, 0]) + r.uniform(-2.2, 2.2, 3), 2.6, 'fur',
                    jit=0.2)
    for _ in range(12):                                               # a shaggy ruff on the chest
        b = np.array([30, -2, 0]) + r.uniform([-6, -8, -9], [4, 4, 9]) + up
        md.cone(b, b + np.array([-3, -9, 0]) + r.uniform(-2, 2, 3), 3.0, 'fur', jit=0.2)
    for x in np.linspace(20, -24, 10):                                # long fur hanging off the flanks
        for s in (1, -1):
            b = np.array([x, -4, 14 * s]) + r.uniform(-2, 2, 3) + up
            md.cone(b, b + np.array([-4, -8, 2 * s]) + r.uniform(-1.5, 1.5, 3), 2.8, 'fur', jit=0.2)
    for x in np.linspace(22, -28, 9):
        y = np.interp(x, [t[0] for t in trunk], [t[1] for t in trunk]) + np.interp(
            x, [t[0] for t in trunk], TR) - 2
        md.cone(np.array([x, y, 0]) + up, np.array([x - 5, y + 8 + 2 * math.sin(x), 0]) + up, 3.0, 'spine')
    # tail
    tail = []
    for k, (x, y) in enumerate([(-30, 1), (-42, -2), (-54, -4), (-66, -3), (-77, 1), (-86, 6)]):
        tail.append((x, y + (4.0 * math.sin(phase - k * 0.7) * k / 5) * w + bob * (1 - k / 5), 2 * math.sin(phase - k)
                     * k / 5 * w))
    tail = _curve(tail, 3)
    md.tube(tail, np.linspace(12, 2.8, len(tail)), 'fur', sides=10, jit=0.12, by_normal=(0.5, -0.5))
    for p in tail[2:-2:2]:
        md.cone(p + np.array([0, 2.5, 0]), p + np.array([-4, 6, 0]), 1.6, 'spine')
    tip = tail[-1]
    md.blob(tip + np.array([-4, 0.5, 0]), (8, 5.5, 5.5), 'fur', sub=1, jit=0.2, rough=0.25)
    for _ in range(9):
        md.cone(tip + r.uniform(-2, 2, 3), tip + np.array([-11, 0, 0]) + r.uniform(-4, 4, 3), 1.8, 'fur', jit=0.2)
    # legs, tucked: front legs folded under the chest, hind legs trailing
    sw = 0.25 * math.sin(phase + 1.2) * w
    for s in (1, -1):
        z = 7.5 * s
        z = 9 * s
        md.tube(_curve([(20, -8, z), (13, -20 + sw, z), (21, -27 + sw, z + s)], 2), [6.5, 4.6, 3.4], 'fur', sides=7,
                rough=0.06)
        md.blob(np.array([23, -28.5 + sw, z + s]) + up * 0, (3.2, 2.6, 2.6), 'hoof', sub=0)
        md.tube(_curve([(-20, -6, z), (-14, -18 - sw, z), (-29, -22 - sw * 1.5, z), (-38, -24 - sw * 2, z)], 2),
                [9.0, 5.4, 3.8, 3.0], 'fur', sides=7, rough=0.06)
        md.blob((-40.5, -24.5 - sw * 2, z), (3.2, 2.6, 2.6), 'hoof', sub=0)
    # wings
    for s in (1, -1):
        wing(md, s, th, fold, lag)
    return md.m


# ---------------------------------------------------------------- to pixels
def camera(view):
    """A long lens from far away (so it looks orthographic), 1 unit = K pixels."""
    if view == 'toward':
        az, el, tgt = math.radians(58), math.radians(14), (6, 4, 0)
    else:
        az, el, tgt = math.radians(24), math.radians(17), (-8, 4, 0)
    d = np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)])
    fov = 6.0
    focal = (FH * K / 2) / math.tan(math.radians(fov / 2))
    dist = focal / K
    return Camera(np.asarray(tgt) + d * dist, tgt, fov, FW * K, FH * K)


def pixelate(rgb, dep, ids):
    """Bring a K-times render down to pixels: each pixel takes the material
    most of its block shows, shaded with that material's ramp."""
    h, w = FH, FW
    blk = lambda a: a.reshape(h, K, w, K).swapaxes(1, 2).reshape(h, w, K * K)
    I = blk(ids)
    cnt = np.stack([(I == m).sum(-1) for m in range(1, len(MATS) + 1)], -1)
    mat = cnt.argmax(-1) + 1
    solid = (I > 0).sum(-1) >= K * K * 0.4
    S = blk(rgb[..., 0] / 200.0)
    D = blk(dep)
    sel = I == mat[..., None]
    shade = (S * sel).sum(-1) / np.maximum(sel.sum(-1), 1)
    depth = np.where(sel, D, 1e30).min(-1)
    out = np.zeros((h, w, 4), np.uint8)
    names = list(MATS)
    for m in range(1, len(MATS) + 1):
        k = solid & (mat == m)
        if not k.any():
            continue
        name = names[m - 1]
        ramp = RAMP[name]
        n = len(ramp)
        v = np.clip((shade[k] - 0.38) / 0.62 + BIAS.get(name, 0.0), 0, 0.999)
        out[k, :3] = ramp[(v * n).astype(int)]
        out[k, 3] = 255
    return out, mat * solid, depth


def finish(px, mat, depth):
    """Inner lines where one part passes in front of another, a cool rim of
    sky light along the top edges, then the pack's selective outline."""
    a = px.copy()
    solid = a[..., 3] > 0
    names = list(MATS)
    dark = {m: RAMP[names[m - 1]][0] for m in range(1, len(MATS) + 1)}
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb_d = np.roll(depth, (dy, dx), (0, 1))
        nb_s = np.roll(solid, (dy, dx), (0, 1))
        nb_m = np.roll(mat, (dy, dx), (0, 1))
        behind = solid & nb_s & (depth > nb_d + 6) & (nb_m != mat)  # this pixel is behind its neighbour
        for m in np.unique(mat[behind]):
            k = behind & (mat == m)
            a[k, :3] = (a[k, :3] * 0.35 + dark[m] * 0.65).astype(np.uint8)
    top = solid & ~np.roll(solid, 1, 0)
    rim = np.array(PAL['cloud3'], np.float32)
    a[top, :3] = (a[top, :3] * 0.6 + rim * 0.4).astype(np.uint8)
    cv = Canvas(FW, FH)
    cv.a = a
    return outline(cv)


def frame(phase, kind='fly', view='side'):
    cam = camera(view)
    rgb, dep, ids = render(cam, [build(phase, kind)], light=LIGHT, ambient=0.38)
    px, mat, depth = pixelate(rgb, dep, ids)
    return finish(px, mat, depth)


ANIMS = {'fly': (16, 'fly', 'side'), 'glide': (12, 'glide', 'side'), 'toward': (16, 'fly', 'toward')}
FPS = 12


def export(out_dir, scale3=True):
    os.makedirs(out_dir, exist_ok=True)
    for name, (n, kind, view) in ANIMS.items():
        frames = [frame(2 * math.pi * i / n, kind, view) for i in range(n)]
        ims = [Image.fromarray(f.a, 'RGBA') for f in frames]
        fw, fh = ims[0].size
        for sc in ((1, 3) if scale3 else (1,)):
            tag = '' if sc == 1 else '_3x'
            sheet = Image.new('RGBA', (fw * sc * n, fh * sc), (0, 0, 0, 0))
            for i, im in enumerate(ims):
                big = im.resize((fw * sc, fh * sc), Image.NEAREST)
                sheet.paste(big, (i * fw * sc, 0))
                fdir = os.path.join(out_dir, 'frames%s' % tag, name)
                os.makedirs(fdir, exist_ok=True)
                big.save(os.path.join(fdir, '%s_%02d.png' % (name, i)))
            sheet.save(os.path.join(out_dir, 'goat_dragon_%s%s_sheet.png' % (name, tag)))
            sky = Image.new('RGBA', (fw * sc, fh * sc), PAL['sky3'] + (255,))
            gif = [Image.alpha_composite(sky, im.resize((fw * sc, fh * sc), Image.NEAREST)).convert('RGB')
                   for im in ims]
            gif[0].save(os.path.join(out_dir, 'goat_dragon_%s%s.gif' % (name, tag)), save_all=True,
                        append_images=gif[1:], duration=int(1000 / FPS), loop=0, optimize=True)
        print(name, n, 'frames', ims[0].size)


if __name__ == '__main__':
    export(sys.argv[1] if len(sys.argv) > 1 else 'goat_flight_out')
